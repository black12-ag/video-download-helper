# Extension-only stream downloads

Owner correction on 2026-11-18: ONLY a browser extension. The desktop-app proposal was canceled before implementation. The new release must not require Python, FFmpeg, a native-messaging registration or a desktop app.

Use the existing popup, per-tab discovery, saved links, generated icon and direct browser downloads. Add a browser HLS path with a bundled Mediabunny module, preserving the component's MPL-2.0 license/notices/source reference. Our project code remains independently written. Reject protected/unsupported inputs explicitly, and never claim Netflix/all-site support from normal playback alone.

For supported streams: inspect available tracks and actual dimensions, then open a persistent extension download tab. Its Save button obtains the user's file choice before doing asynchronous work. Remux encoded tracks to a writable file without transcoding or buffering the full video. Progress/cancel stays visible in the popup and download tab. File writes are aborted on Stop; user files are never silently overwritten or deleted. The extension tab must remain open until the stream finishes.

## Implementation checklist

- [x] Browser media module: `inspectHls(url, options)` returns serializable variants; `remuxHls(url, {videoId,audioId,writable,signal,onProgress})` writes media. Bundle/pin dependency and notices, test playable AVC/AAC output and supported selections.
- [x] Extension background: replace installed-engine UI path with HLS inspection, validate source URLs against discovered items, keep stream job records in session storage, accept progress only from the trusted extension download page, and cancel only this extension's jobs.
- [x] Extension download tab: show source/title/quality and Save/Stop controls, use File System Access with user activation, maintain a cancellable remux, report honest progress and final output size. No cookies API or exported login data; requests stay in the browser.
- [x] Popup: keep direct progress/pause/resume/retry, show HLS qualities and open the stream download tab, remove helper installation/permission controls. Preserve saved links; old helper-only saved formats require rescanning the original page.
- [x] Verify unit tests, actual extension loading, generated HLS video+audio output with FFprobe, cancellation/error states, direct-file regressions, packaging and notices. Record browser/platform limits and any unverified file-dialog behavior.

No universal promise: raw DRM-encrypted Netflix media is not a supported export simply because the user can watch it. Only completed playable-output tests count as support.
