import importlib.util
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vdh_host', ROOT / 'companion/host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class CompanionTests(unittest.TestCase):
    def test_rejects_unsafe_urls(self):
        for value in ['file:///etc/passwd', 'javascript:x', 'https://user:pass@example.org/a', None, '--exec=bad']:
            with self.assertRaises(ValueError): host.valid_url(value)

    def test_names_cannot_escape_or_inject_output_templates(self):
        self.assertNotIn('/', host.safe_name('../holiday.mp4'))
        self.assertEqual(host.safe_name('%(id)s.mp4'), '%%(id)s')
        self.assertEqual(host.safe_name('ጉዞ.mp4'), 'ጉዞ')
        self.assertLessEqual(len(host.safe_name('🎬' * 200).encode()), 180)

    def test_catalog_combines_compatible_audio_and_filters_drm(self):
        info = {'title': 'Example', 'formats': [
            {'format_id': '137', 'ext': 'mp4', 'height': 1080, 'vcodec': 'avc1', 'acodec': 'none'},
            {'format_id': '140', 'ext': 'm4a', 'vcodec': 'none', 'acodec': 'aac', 'abr': 128, 'language_preference': 10},
            {'format_id': 'dubbed', 'ext': 'm4a', 'vcodec': 'none', 'acodec': 'aac', 'abr': 256, 'language_preference': -10},
            {'format_id': 'drm', 'ext': 'mp4', 'vcodec': 'avc1', 'has_drm': True},
        ]}
        result = host.catalog(info)
        self.assertEqual(len(result['formats']), 1)
        self.assertEqual(result['formats'][0]['selector'], '137+140')
        with self.assertRaises(ValueError): host.catalog({'has_drm': True})

    def test_silent_video_without_audio_is_not_offered(self):
        with self.assertRaises(ValueError): host.catalog({'formats': [{'format_id': '1', 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'none'}]})

    def test_rejects_arbitrary_format_selector_before_launch(self):
        bridge = host.Bridge({}, lambda message: None)
        with patch.object(bridge, 'inspect', return_value={'formats': [], 'title': 'Video'}):
            with self.assertRaises(ValueError): bridge.download({'id': 'abcd', 'url': 'https://example.org/a', 'formatId': 'best;exec'})
        self.assertEqual(bridge.jobs, {})

    def test_native_protocol_ping(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'config.json'
            config.write_text('{}')
            message = json.dumps({'id': 'check', 'op': 'ping'}).encode()
            proc = subprocess.run([sys.executable, str(ROOT / 'companion/host.py'), '--config', str(config)], input=struct.pack('=I', len(message)) + message, capture_output=True, timeout=5)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            size = struct.unpack('=I', proc.stdout[:4])[0]
            response = json.loads(proc.stdout[4:4 + size])
            self.assertEqual(response, {'id': 'check', 'data': {'ready': True}})

    def test_cancel_handles_pending_and_running_processes(self):
        bridge = host.Bridge({}, lambda message: None)
        process = object()
        bridge.jobs = {'pending': None, 'running': process}
        with patch.object(host, 'terminate') as terminate:
            bridge.handle({'id': 'cancel1', 'op': 'cancel', 'jobId': 'pending'})
            self.assertIs(bridge.jobs['pending'], False)
            bridge.handle({'id': 'cancel2', 'op': 'cancel', 'jobId': 'running'})
            terminate.assert_called_once_with(process)

    def test_disconnect_prevents_new_downloads(self):
        bridge = host.Bridge({}, lambda message: None)
        bridge.close()
        with self.assertRaisesRegex(ValueError, 'cancelled'):
            bridge.handle({'id': 'after_close', 'op': 'download', 'url': 'https://example.org/a'})


if __name__ == '__main__': unittest.main()
