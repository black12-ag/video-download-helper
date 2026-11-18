"""Register the local helper for one extension ID. No admin access or daemon."""
import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import sys

HOST = 'org.video_download_helper.local'


def install(extension_id, manifest_dir, home, ytdlp, ffmpeg, node=None, downloads=None):
    if not re.fullmatch('[a-p]{32}', extension_id):
        raise ValueError('Copy the 32-letter ID from the browser extensions page')
    manifest_dir, home = Path(manifest_dir).expanduser().resolve(), Path(home).expanduser().resolve()
    for directory in (manifest_dir, home):
        directory.mkdir(parents=True, exist_ok=True)
    config = dict(ytdlp=ytdlp, ffmpeg=ffmpeg, node=node, downloads=str(downloads or Path.home() / 'Downloads'))
    shutil.copyfile(Path(__file__).with_name('host.py'), home / 'host.py')
    (home / 'config.json').write_text(json.dumps(config))
    launcher = home / 'launch'
    launcher.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(home / 'host.py')) + ' --config ' + shlex.quote(str(home / 'config.json')) + ' "$@"\n')
    launcher.chmod(0o700)
    target = manifest_dir / (HOST + '.json')
    origins = ['chrome-extension://' + extension_id + '/']
    if target.exists():
        old = json.loads(target.read_text())
        if old.get('path') != str(launcher):
            raise ValueError('A different helper is registered here; choose its existing helper directory to update safely')
        origins = list(dict.fromkeys(old.get('allowed_origins', []) + origins))
    target.write_text(json.dumps(dict(name=HOST, description='Video Download Helper local engine', path=str(launcher), type='stdio', allowed_origins=origins), indent=2))
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extension-id', required=True)
    parser.add_argument('--browser', choices=['chrome', 'chrome-testing', 'comet', 'chromium'], default='chrome')
    parser.add_argument('--manifest-dir', type=Path)
    parser.add_argument('--home', type=Path, default=Path.home() / 'Library/Application Support/VideoDownloadHelper')
    parser.add_argument('--ytdlp', default=shutil.which('yt-dlp'))
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
    args = parser.parse_args()
    if sys.platform != 'darwin' and not args.manifest_dir:
        parser.error('Supply --manifest-dir for your browser on this operating system')
    if not args.ytdlp or not args.ffmpeg:
        parser.error('Install yt-dlp and FFmpeg first; see companion/README.md')
    # Zipapp yt-dlp often has a system-Python shebang; use this supported interpreter.
    ytdlp = [str(Path(args.ytdlp).resolve())]
    with Path(args.ytdlp).open('rb') as source:
        shebang = source.readline(200)
    if shebang.startswith(b'#!/usr/bin/env') and b'python' in shebang:
        ytdlp.insert(0, sys.executable)
    subprocess_module = __import__('subprocess')
    subprocess_module.run(ytdlp + ['--version'], check=True)
    roots = {'chrome': 'Google/Chrome', 'chrome-testing': 'Google/ChromeForTesting', 'comet': 'Comet', 'chromium': 'Chromium'}
    directory = args.manifest_dir or Path.home() / 'Library/Application Support' / roots[args.browser] / 'NativeMessagingHosts'
    print(install(args.extension_id, directory, args.home, ytdlp, str(Path(args.ffmpeg).absolute()), shutil.which('node')))
