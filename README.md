# Video Download Helper

A small, independent, open-source video downloader for Chromium browsers. No account, ads, paywall, watermark, telemetry or cloud server. MIT licensed. Direct-file downloads need no runtime dependencies.

**v0.3 stream downloads:** an optional [free local engine](companion/README.md) uses installed yt-dlp and FFmpeg to discover formats and combine separate video/audio. Direct-file downloads need only the extension. The helper is included in the release ZIP; binaries and dependencies are not bundled. Native messaging must be enabled explicitly and supported by your browser.

**Independent project:** despite the requested project name, this is not the SAS ACLAP extension from the Chrome Web Store and is not affiliated with it. Use a distinct brand before submitting to an extension store.

![Video Download Helper popup](docs/popup.png)

## Install

1. Download or clone this repository.
2. In a Chromium browser, open `chrome://extensions` (or its equivalent), enable **Developer mode**, then choose **Load unpacked**.
3. Select the **extension** folder (not the repository root). Pin Video Download Helper in the toolbar.
4. Open a website, play a video, and click Video Download Helper. It scans automatically; use **↻ Scan page** to refresh. Choose an available quality, edit the filename if you want, then click **Download**. Use **Downloads ↗** for progress, pause/resume, and errors.

Already installed? Replace the extension files with the new release and click **Reload** in your browser's extensions manager. Saved videos remain on this device when reloading an existing installation.

Chrome/Chromium 120+ required. Orca is Chromium based, but its extension installation UI must expose Load unpacked; installation in Orca itself has not yet been verified. No store listing or signed extension is provided.

## What works

- Direct MP4, WebM, Ogg, MOV and M4V files, including signed URLs.
- Video response MIME types, even when URLs lack a file extension.
- Page videos, source elements, media links, performance resources and accessible embedded frames.
- Actual video dimensions when the browser exposes them, and file size when the server supplies it. Related source files from the same video appear in a quality selector. Unrelated videos stay separate; the extension does not invent qualities, bitrates or upscale.
- Automatic names from a video's title/accessible label/caption, then page metadata/title as a fallback. Edit the filename directly or use the pencil button. Renaming preserves the real source format; changing `.mp4` to `.webm` in a name does not convert the file. Saved videos remember edited names.
- Lightweight poster thumbnails and duration when the page provides them. There are no autoplay previews, remote fonts or UI libraries. Live discovery updates are batched and do not interrupt filename editing.
- Per-tab discovery, duplicate removal, toolbar count, and a local saved-video list.
- With the local engine: supported YouTube/HLS/DASH formats, real dimensions/codecs/encoded bitrate, audio pairing/merging, and local progress/cancel. Encoded bitrate in the quality list is not download speed. The exact YouTube song in the owner's report was tested with video and audio; this is not an all-sites guarantee.
- Native browser downloads: streams directly to disk, without buffering the whole video in extension memory or routing through a third party. Existing filenames are preserved through automatic uniquifying.

## Limits

Without the local engine, HLS (`m3u8`) and DASH (`mpd`) manifests are detected but need **Find qualities** and engine setup to download. With the engine connected, yt-dlp handles supported non-DRM streams and FFmpeg combines audio/video. DRM, live recording, general format conversion, standalone audio extraction and casting are outside this version. Websites requiring authentication, special headers or anti-bot credentials can still refuse a download; no browser cookies are exported. Direct-file errors appear in Browser downloads; local-engine errors appear in the popup. No universal website compatibility or speed advantage is claimed.

Play the video after installing, then scan. Network observation begins when the extension is enabled; it cannot recover past response headers. A tab's results clear on navigation or close. Only discovered links can be downloaded. Lists are capped at 200 entries; saved links can expire. Save for later is a bookmark, not an offline copy.

Download only media you have permission to save. This project is independent of Link64 and SAS ACLAP and contains none of their code or assets.

## Privacy and permissions

See [PRIVACY.md](PRIVACY.md). Host access covers HTTP(S) pages and video CDNs so cross-origin players can be discovered. `webRequest` reads response metadata; it never blocks or changes requests. `activeTab` and `scripting` scan the selected page. `storage` keeps temporary findings and explicitly saved links on your device. `downloads` saves the chosen file. There is no cookie API access, remote code, analytics, or external backend.

The optional `nativeMessaging` permission connects only to the locally registered `org.video_download_helper.local` helper. You grant it from **Local engine → Connect local engine**. It is not required for direct files. The helper runs installed Python/yt-dlp/FFmpeg/Node tools and requests media from its original provider; it does not expose a network service or accept shell commands from a page.

## Development and tests

`npm test` runs the dependency-free unit tests. `npm run check` checks JavaScript syntax. `npm run package` creates a verified ZIP in `dist/`; extract the ZIP and load the extracted folder to install a release. GitHub Actions runs unit tests, syntax checks and packaging on pushes and pull requests.

`npm run test:companion` runs eight dependency-free Python validation/protocol checks. See [the reference audit](docs/reference-audit.md) for REA evidence and actual tests of the installed reference, and [validation](docs/validation.md) for the independent implementation's checked results and limits.

For browser integration tests, install Playwright as a development tool (`npm install --no-save playwright`, then `npx playwright install chromium`). A generated test video requires FFmpeg:

```sh
ffmpeg -f lavfi -i testsrc2=s=960x540:d=5 -an -c:v libx264 -pix_fmt yuv420p /tmp/open-video-fixture.mp4
node tests/browser.mjs
```

The harness starts a disposable browser with the actual extension and a local HTTP fixture server. It checks MIME discovery, frames, dimensions, deduplication, manifests, saved links, exact downloaded bytes, rejected URLs, navigation cleanup, blob handling and HTTP failures. Public pages are smoke checks; unreachable pages are reported as UNVERIFIED. `VIDEO_FIXTURE`, `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can point at existing tooling. Test output/screenshots go in ignored `test-results/`.

Contributions: keep runtime dependencies at zero, add a regression check for behavior changes, and document any new permissions. Never commit browsing data, signed media URLs, cookies, or credentials.
