# Privacy

Video Download Helper has no analytics, advertising, accounts, payment service, or backend. It does not transmit browsing data to its developers.

While enabled, it observes HTTP(S) response URLs, media type and size, associated tab title and page URL to identify video files. Temporary per-tab records use browser session storage and are removed on tab navigation or closure. Browser-session storage clears when the browser session ends. It scans the selected page's video elements, media links and resource URLs when you open the popup or press Scan.

When you explicitly save a video, its link, title, originating page and detected metadata are stored locally. Links may contain private access tokens. Saved videos are not synced by this extension. Remove a saved item from the Saved videos tab, or uninstall the extension to delete its storage. Your downloaded files remain on disk after uninstalling.

The popup tracks only browser download IDs started by this extension, plus its optional local-engine jobs. While the popup is open and a transfer is active, it samples those browser IDs for bytes, rate, size, time estimates and controls. Transfer records use browser session storage; ongoing jobs and a bounded recent completed list are kept so reopening the popup can restore progress. It does not enumerate unrelated download history for the progress view. Browser Pause/Resume/Stop use the browser's own download API and never delete completed files.

For up to six direct-file candidates with unknown sizes, the popup may request HTTP HEAD metadata from the original media URL, without cookies and with a short timeout. Some servers refuse HEAD or omit sizes; those fields stay unknown until the transfer provides them. This does not fetch the video body or fabricate a resolution, bitrate or ETA.

The popup may load a video's poster image from its original HTTP(S) URL when the website provides one. This can contact the image's original server, using the browser's ordinary image-request behavior. It does not load autoplay video previews. Poster URLs, video labels, captions and duration may be stored with the detected/saved video. An edited saved filename stays in local storage with that video.

## Optional local engine

Only after you install the helper and grant `nativeMessaging`, the extension can send the selected video page/manifest URL, selected format and requested filename to a local yt-dlp/FFmpeg process. That process contacts the original website/CDN, discovers video/audio formats and writes combined media into Downloads. It does not send media or browsing data to this project's developers, read browser cookies, or use your global yt-dlp configuration. JavaScript challenge solving may run through your installed Node runtime and the maintained yt-dlp EJS component.

The browser starts the helper as a native process; there is no HTTP listener, remote server or system daemon. Its native host manifest allows only explicitly registered extension IDs. The helper keeps up to ten format catalogs in memory, permits two downloads at a time and stores no download-history database. The extension holds up to twenty local-job status entries in browser session storage. Local helper configuration contains tool paths and the download folder, not credentials. Installation may download Python/packages through uv/PyPI. Closing the browser stops helper processes; partial media files can remain after cancellation or failure.

Clicking Download makes the browser request the file from its original server. That server receives an ordinary download request and may receive the browser's normal authentication cookies. Video Download Helper does not read cookies or send them to another service. The browser manages download progress and errors. Permissions permit broad page access because media often comes from a different host than the page; the extension does not alter network requests or inject remote code.
