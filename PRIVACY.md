# Privacy

Video Download Helper is a browser extension with no developer backend, advertising, telemetry, payment service or account system. Media is requested from its original providers; the developers do not receive your browsing data or files.

## Detection and local state

While enabled, the extension observes HTTP(S) media response URLs/type/size and scans the selected page's videos, media links and resource URLs. Findings include title, source page, poster, duration and known dimensions. Temporary per-tab records clear on navigation/closure; job records use browser session storage. The extension tracks only browser download IDs it created and its registered stream tabs. Popup progress polling does not enumerate unrelated download history.

Saved video links and edited names remain in local extension storage until removed or the extension is uninstalled. Links may contain personal access tokens and may expire. They are not synced by this extension. Downloaded files remain on disk after uninstalling.

The popup may fetch the original HTTP(S) poster image without a referrer. Up to six unknown direct-file sizes can be probed with short, cookie-free HEAD requests. No full video is fetched by that size probe; refused/unknown metadata remains unknown.

## Stream saving

Supported HLS is inspected and combined by bundled JavaScript inside the browser. The selected manifest's origin can receive its ordinary browser cookies; unrelated resource origins are fetched without credentials. HTTP redirects and known encrypted/protected inputs are rejected. The extension does not read/export cookie values, passwords, DRM keys or license responses, and does not use the cookies API.

Clicking Download for HLS opens a registered extension tab containing only a random job ID in its URL. The browser's Save dialog grants writing to the specific file you choose. The file handle stays in that page, not in extension session records or a server. Stop aborts an unfinished writable; an existing file is not committed/replaced until successful finalization. Keep the download tab open until complete. Reopening the popup restores job status; browser-restart recovery is not offered.

The bundled media code is local. There is no remote script loading, HTTP listener, native messaging host, desktop app or Python/FFmpeg runtime. Development tests use those tools only to verify the generated media. Old helper installations from older versions are not contacted, modified or removed by this release.

## Controls

Remove a saved link in Saved videos. Dismiss a detection with ×. Stop or Pause/Resume only extension-created browser transfers; Stop also cancels registered stream jobs. The extension never silently deletes completed user files. Uninstalling removes extension storage, not saved media or any unrelated legacy software.
