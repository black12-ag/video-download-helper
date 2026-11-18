"""Free local yt-dlp/FFmpeg bridge. Chrome native messaging; no HTTP server."""
from __future__ import annotations
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import struct
import signal
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

HOST = 'org.video_download_helper.local'


def terminate(proc):
    try:
        os.killpg(proc.pid, signal.SIGTERM) if os.name == 'posix' else proc.terminate()
    except ProcessLookupError:
        pass


def valid_url(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ValueError('Invalid video URL')
    parsed = urlsplit(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Only HTTP(S) video URLs are accepted')
    return value


def safe_name(value):
    if not isinstance(value, str):
        raise ValueError('Invalid filename')
    value = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|]', ' ', value).strip('. ')
    value = re.sub(r'\.(mp4|webm|mkv|mov|m4v|ogv)$', '', value, flags=re.I)
    while len(value.encode('utf-8')) > 180:
        value = value[:-1]
    if re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])$', value, re.I):
        value = '_' + value
    return (value or 'video').replace('%', '%%')


def catalog(info):
    if info.get('is_live') or info.get('has_drm'):
        raise ValueError('Live recording and DRM-protected video are not supported')
    formats = [f for f in info.get('formats', []) if not f.get('has_drm')]
    audio = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') not in (None, 'none')]
    result = []
    for f in formats:
        fid = str(f.get('format_id', ''))
        if f.get('vcodec') in (None, 'none') or not re.fullmatch(r'[\w.-]+', fid) or f.get('ext') not in ('mp4', 'webm', 'mkv'):
            continue
        ext, selector = f['ext'], fid
        chosen_audio = None
        if f.get('acodec') == 'none':
            compatible = [a for a in audio if a.get('ext') == ('m4a' if ext == 'mp4' else 'webm')]
            candidates = compatible or audio
            if not candidates:
                continue  # Never offer silent video as a complete download.
            chosen_audio = max(candidates, key=lambda a: (a.get('language_preference') if a.get('language_preference') is not None else -1, a.get('abr') or a.get('tbr') or 0))
            aid = str(chosen_audio['format_id'])
            if not re.fullmatch(r'[\w.-]+', aid):
                continue
            selector += '+' + aid
            if not compatible:
                ext = 'mkv'
        size = f.get('filesize') or f.get('filesize_approx') or 0
        if chosen_audio:
            audio_size = chosen_audio.get('filesize') or chosen_audio.get('filesize_approx') or 0
            size = size + audio_size if size and audio_size else 0
        result.append(dict(id=fid, selector=selector, ext=ext, width=f.get('width') or 0,
                           height=f.get('height') or 0, size=size, approximate=True,
                           bitrate=(f.get('tbr') or 0) + ((chosen_audio or {}).get('tbr') or 0),
                           codec=str(f.get('vcodec', '')).split('.')[0]))
    result.sort(key=lambda f: (f['height'], f['width'], f['ext'] == 'mp4', f['bitrate']), reverse=True)
    if not result:
        raise ValueError('No downloadable video with audio was found')
    return dict(title=info.get('title') or 'Video', poster=info.get('thumbnail') or '',
                duration=info.get('duration') or 0, formats=result[:100])


class Bridge:
    def __init__(self, config, emit):
        self.config, self.emit = config, emit
        self.cache, self.jobs = {}, {}
        self.lock = threading.Lock()
        self.closed = False

    def command(self):
        args = self.config['ytdlp'] + ['--ignore-config', '--no-playlist', '--socket-timeout', '20', '--retries', '2', '--no-warnings']
        if self.config.get('node'):
            args += ['--js-runtimes', 'node:' + self.config['node']]
        return args

    def inspect(self, url):
        valid_url(url)
        cached = self.cache.get(url)
        if cached and time.monotonic() - cached[0] < 600:
            return cached[1]
        proc = subprocess.run(self.command() + ['--skip-download', '--dump-single-json', '--', url], capture_output=True, text=True, timeout=90)
        if proc.returncode:
            raise ValueError((proc.stderr.strip() or 'The website refused video discovery')[-600:])
        result = catalog(json.loads(proc.stdout))
        if len(self.cache) >= 10:
            self.cache.pop(next(iter(self.cache)))
        self.cache[url] = (time.monotonic(), result)
        return result

    def download(self, request):
        url = valid_url(request.get('url'))
        with self.lock:
            if self.closed or request['id'] in self.jobs:
                raise ValueError('Download cancelled or already running')
            if len(self.jobs) >= 2:
                raise ValueError('Two downloads are already running. Wait or cancel one first.')
            job = request['id']
            self.jobs[job] = None
        proc = None
        try:
            info = self.inspect(url)
            chosen = next((f for f in info['formats'] if f['id'] == request.get('formatId')), None)
            if not chosen:
                raise ValueError('This quality is no longer available. Refresh the formats.')
            folder = Path(self.config['downloads']).expanduser().resolve()
            folder.mkdir(parents=True, exist_ok=True)
            stem = safe_name(request.get('name') or info['title'])
            # Job suffix prevents overlapping downloads from sharing partial files.
            output = str(folder / (stem + ' [' + job[:8] + '].%(ext)s'))
            args = self.command() + ['--ffmpeg-location', self.config['ffmpeg'], '-f', chosen['selector'],
                    '--merge-output-format', chosen['ext'], '--concurrent-fragments', '4', '--no-overwrites',
                    '--newline', '--progress', '--progress-template', 'download:VDH:%(progress)j',
                    '--print', 'after_move:VDH_FILE:%(filepath)j', '--no-simulate', '-o', output, '--', url]
            with self.lock:
                if self.closed or self.jobs.get(job) is False:
                    raise ValueError('Download cancelled')
                proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
                self.jobs[job] = proc
            last = 'Download failed'
            last_emit = 0
            for line in proc.stdout:
                if line.startswith('VDH:'):
                    data = json.loads(line[4:])
                    if time.monotonic() - last_emit > .5:
                        total = data.get('total_bytes') or data.get('total_bytes_estimate') or 0
                        self.emit(dict(event='progress', jobId=job, status='downloading',
                                       percent=min(100, round(data.get('downloaded_bytes', 0) / total * 100, 1)) if total else None,
                                       speed=data.get('speed') or 0, eta=data.get('eta')))
                        last_emit = time.monotonic()
                elif line.startswith('VDH_FILE:'):
                    destination = json.loads(line[len('VDH_FILE:'):])
                elif line.startswith('[Merger]'):
                    self.emit(dict(event='progress', jobId=job, status='merging', percent=None))
                elif line.strip():
                    last = line.strip()[-600:]
            code = proc.wait()
            if code:
                raise ValueError(last if code > 0 else 'Download cancelled')
            if 'destination' not in locals() or not Path(destination).is_file():
                raise ValueError('Download finished without an output file')
            self.emit(dict(event='progress', jobId=job, status='complete', percent=100, filename=destination))
            return {'filename': destination}
        finally:
            if proc:
                if proc.poll() is None:
                    terminate(proc)
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL) if os.name == 'posix' else proc.kill()
                        proc.wait()
                proc.stdout.close()
            with self.lock:
                self.jobs.pop(request['id'], None)

    def handle(self, request):
        if not isinstance(request, dict) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', str(request.get('id', ''))):
            raise ValueError('Invalid request')
        op = request.get('op')
        if op == 'ping':
            return {'ready': True}
        if op == 'inspect':
            return self.inspect(valid_url(request.get('url')))
        if op == 'download':
            return self.download(request)
        if op == 'cancel':
            with self.lock:
                proc = self.jobs.get(request.get('jobId'))
                if proc:
                    terminate(proc)
                elif request.get('jobId') in self.jobs:
                    self.jobs[request['jobId']] = False
            return True
        raise ValueError('Unknown operation')

    def close(self):
        with self.lock:
            self.closed = True
            for proc in self.jobs.values():
                if proc:
                    terminate(proc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('origin', nargs='?')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    output_lock = threading.Lock()

    def emit(data):
        raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
        if len(raw) > 1000000:
            raise ValueError('Response too large')
        with output_lock:
            sys.stdout.buffer.write(struct.pack('=I', len(raw)) + raw)
            sys.stdout.buffer.flush()

    bridge = Bridge(config, emit)

    def process(request):
        try:
            emit({'id': request.get('id'), 'data': bridge.handle(request)})
        except Exception as error:
            emit({'id': request.get('id') if isinstance(request, dict) else None, 'error': str(error)[:600]})

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    try:
        while True:
            header = sys.stdin.buffer.read(4)
            if not header:
                break
            if len(header) != 4:
                break
            size = struct.unpack('=I', header)[0]
            if size > 65536:
                break
            raw = sys.stdin.buffer.read(size)
            if len(raw) != size:
                break
            try:
                request = json.loads(raw)
            except ValueError:
                break
            if isinstance(request, dict) and request.get('op') in ('ping', 'cancel'):
                process(request)  # Cancellation must not queue behind downloads.
            else:
                pool.submit(process, request)
    finally:
        bridge.close()
        pool.shutdown(wait=True, cancel_futures=True)


if __name__ == '__main__':
    main()
