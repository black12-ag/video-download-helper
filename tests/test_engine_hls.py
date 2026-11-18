"""Opt-in real-engine check: VDH_ENGINE_PYTHON and VDH_YTDLP select installed tools."""
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vdh_hls_host', ROOT / 'companion/host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


@unittest.skipUnless(os.environ.get('VDH_YTDLP'), 'Set VDH_YTDLP for the real FFmpeg/yt-dlp HLS integration check')
class HlsIntegration(unittest.TestCase):
    def test_manifest_download_merges_to_playable_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=3', '-f', 'lavfi', '-i', 'sine=duration=3', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-hls_time', '1', '-hls_list_size', '0', str(root / 'media.m3u8')], check=True)
            (root / 'master.m3u8').write_text('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=320x180,CODECS="avc1.42c00d,mp4a.40.2"\nmedia.m3u8\n')
            class Quiet(http.server.SimpleHTTPRequestHandler):
                def log_message(self, *args): pass
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=folder))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                config = dict(ytdlp=[os.environ['VDH_ENGINE_PYTHON'], os.environ['VDH_YTDLP']], ffmpeg=os.environ.get('VDH_FFMPEG', 'ffmpeg'), downloads=str(root / 'downloads'))
                events = []
                bridge = host.Bridge(config, events.append)
                url = 'http://127.0.0.1:%s/master.m3u8' % server.server_port
                catalog = bridge.inspect(url)
                self.assertTrue(catalog['formats'])
                result = bridge.handle(dict(id='local_hls', op='download', url=url, formatId=catalog['formats'][0]['id'], name='Local stream'))
                metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', result['filename']]))
                self.assertEqual({s['codec_type'] for s in metadata['streams']}, {'video', 'audio'})
                self.assertTrue(any(event.get('receivedBytes', 0) > 0 for event in events))
                self.assertEqual(events[-1]['status'], 'complete')
                self.assertGreater(events[-1]['fileSize'], 0)
            finally:
                server.shutdown()
                server.server_close()


if __name__ == '__main__': unittest.main()
