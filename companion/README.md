# Free local engine

Version 0.3 adds optional yt-dlp + FFmpeg downloads for sites with separate video/audio or segmented streams. The extension still downloads direct files without installing this helper.

The helper is open source and runs on your machine. There is no account, payment, remote relay, or HTTP server. Browser native messaging limits access to the specific extension IDs registered by you. It never reads browser cookies or your global yt-dlp configuration. Websites that require sign-in, DRM, or anti-bot credentials may refuse downloads; live recording is not offered.

## macOS setup

1. Install/reload the v0.3 extension in Chrome or a Chromium browser with native messaging support. Open **Local engine** in its popup and copy the extension ID.
2. Ensure [uv](https://docs.astral.sh/uv/getting-started/installation/) and [FFmpeg](https://ffmpeg.org/download.html) are installed. Node.js is needed for full YouTube extraction. The setup command creates a separate Python 3.13 environment and installs current `yt-dlp[default]` from PyPI, including its JavaScript solver package.
3. From the repository root (or the extracted release ZIP), run:

```sh
sh companion/setup-macos.sh YOUR_EXTENSION_ID comet
```

Use `chrome`, `comet`, `chrome-testing` or `chromium` as appropriate. This installs only this helper and registers its manifest for that browser; it does not replace global Python/yt-dlp or change your browser's download settings. It may download Python/packages through uv if missing.

4. Open the extension popup → **Local engine** → **Connect local engine**, and approve the browser's optional native-messaging permission. Then use **Find all qualities** on the video page. YouTube and Vimeo format discovery starts automatically on future popup opens when the helper is connected.

Native messaging was verified end to end in Chrome for Testing on macOS. Comet uses its own registration directory; its connection must be verified after setup. Orca may not expose Chrome's native messaging API; if it does not, use a compatible Chromium browser for the local engine. Direct-file downloads remain available in either case. No Firefox or Windows installer is included.

## What changes when connected

- Uses the original page URL to discover supported formats, dimensions, codecs, bitrates, title and thumbnail.
- Pairs a selected video-only format with compatible audio and uses FFmpeg to combine them. Output is MP4/WebM, or MKV when the discovered audio/video combination requires it. This is not a format converter.
- Shows actual download speed separately from encoded bitrate. `kb/s bitrate` in the quality list is the media's encoding rate, not transfer throughput. Approximate file sizes are labeled.
- Streams to disk, with up to four fragment requests for segmented sources. Two jobs may run at once. There is no artificial transfer-rate cap, but the server/connection sets the achievable speed.
- Shows preparation, current-track progress, combining, completion/errors, and Cancel. Closing the popup does not stop a job; closing the browser or disconnecting the native host cancels its processes.
- Saves to your normal `~/Downloads` folder. A short job suffix avoids collisions with existing or concurrent files. Partial files may remain after cancellation/failure for diagnosis; existing user files are not overwritten.

## Manual setup / other supported host directories

With Python 3.10+ and current yt-dlp, FFmpeg and Node installed:

```sh
python3 companion/install.py --extension-id YOUR_EXTENSION_ID --browser chrome
```

Use `--ytdlp /absolute/path/to/yt-dlp`, `--ffmpeg /absolute/path/to/ffmpeg` if needed. For another native-messaging-compatible browser/platform, supply its documented `--manifest-dir /absolute/path/to/NativeMessagingHosts` and an absolute `--home` directory for helper files. This does not establish that the browser implements native messaging. Windows is not supported by this installer.

To update the private engine dependencies, run setup again. To uninstall, remove only `org.video_download_helper.local.json` from the browser's NativeMessagingHosts directory and the `VideoDownloadHelper` application-support folder. You may also remove `~/.local/share/video-download-helper/venv` if you no longer need the engine. Downloaded media stays in Downloads.

## Checks

`npm run test:companion` runs dependency-free validation/protocol tests. The opt-in `tests/test_engine_hls.py` checks a generated local HLS video and audio using installed yt-dlp/FFmpeg. `tests/engine-browser.mjs` installs the native host only into a disposable browser profile, tests the browser/host handshake, inspects the reference YouTube song and verifies completed MP4/WebM outputs with FFprobe. Production uses an optional permission prompt; the isolated test fixture grants that permission in its test manifest. No personal browser profile is modified.
