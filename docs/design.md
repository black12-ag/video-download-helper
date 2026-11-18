# Video Download Helper

Approved by the owner on 2026-11-18: build an original MIT-licensed Chromium extension with video detection, available quality choices, downloads, and a saved list. No accounts, ads, payment, or telemetry. Stream merging and DRM are outside version 1.

The MV3 service worker observes video response metadata and scans media elements in all accessible frames on request. Detection lives in session storage per tab; saved links live in local storage. The popup presents each discovered file/quality and delegates downloads to the browser. Only HTTP(S) URLs are accepted. Untrusted text is rendered through textContent. No remote code, libraries, servers, or cookie reading.

Permissions: HTTP(S) host access and webRequest for passive video discovery; activeTab and scripting for scanning the selected page; storage for findings and saved links; downloads for explicit downloads. No blocking request changes. Clear tab findings on navigation/close; bound stored lists. Download URLs can expire or require headers that the browser cannot supply. Blob URLs and segmented manifests are identified as unsupported rather than downloaded as broken videos.

References: public Chrome Store listings for Video Downloader Professional and Video Download Helper. REA inspected the public listing in a disposable browser; no proprietary extension code or assets are copied. This is an independent implementation, not a claim of feature parity.
