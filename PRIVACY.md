# Privacy

Video Download Helper has no analytics, advertising, accounts, payment service, or backend. It does not transmit browsing data to its developers.

While enabled, it observes HTTP(S) response URLs, media type and size, associated tab title and page URL to identify video files. Temporary per-tab records use browser session storage and are removed on tab navigation or closure. Browser-session storage clears when the browser session ends. It scans the selected page's video elements, media links and resource URLs when you open the popup or press Scan.

When you explicitly save a video, its link, title, originating page and detected metadata are stored locally. Links may contain private access tokens. Saved videos are not synced by this extension. Remove a saved item from the Saved videos tab, or uninstall the extension to delete its storage. Your downloaded files remain on disk after uninstalling.

The popup may load a video's poster image from its original HTTP(S) URL when the website provides one. This can contact the image's original server, using the browser's ordinary image-request behavior. It does not load autoplay video previews. Poster URLs, video labels, captions and duration may be stored with the detected/saved video. An edited saved filename stays in local storage with that video.

Clicking Download makes the browser request the file from its original server. That server receives an ordinary download request and may receive the browser's normal authentication cookies. Video Download Helper does not read cookies or send them to another service. The browser manages download progress and errors. Permissions permit broad page access because media often comes from a different host than the page; the extension does not alter network requests or inject remote code.
