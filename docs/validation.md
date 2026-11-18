# Validation — 2026-11-18

The real unpacked MV3 extension ran in a disposable Chrome for Testing 156 profile. The user's personal profile was not modified. The popup was visually reviewed from a browser screenshot. `npm test` passed all four unit checks; JavaScript syntax checks and ZIP self-check passed.

Browser integration checks passed: MP4, extensionless video MIME response, cross-origin iframe, distinct 540p and 180p dimensions, duplicate removal, manifest identification, actual Download button, saved-link deduplication/removal, rejected unknown URL, unsupported stream rejection, navigation cleanup, blob notice, and interrupted HTTP-403 download. A 1,410,297-byte local fixture completed in 107 ms and its SHA-256 matched the source. These fixture measurements describe local test overhead, not internet bandwidth.

Public samples detected and downloaded successfully. Download bytes matched the browser's reported total, and MP4 headers were checked:

| Source | Bytes | Browser transfer time | Throughput |
| --- | ---: | ---: | ---: |
| W3Schools `html/mov_bbb.mp4` | 788,493 | 0.52 s | 1.45 MiB/s |
| MDN `media/cc0-videos/flower.mp4` | 1,128,375 | 0.24 s | 4.43 MiB/s |
| W3C `2010/05/sintel/trailer.mp4` | 4,372,373 | 2.30 s | 1.81 MiB/s |

Times are one observed run and vary with server, cache and connection. Earlier public HTML routes did not expose a playable video; those routes are not claimed supported. A separate command-line request to W3Schools received 403, while the actual browser download subsequently succeeded. Public smoke failures are explicitly reported as UNVERIFIED by the harness rather than failing the deterministic local regression checks.

References inspected: [Video Downloader Professional](https://chromewebstore.google.com/detail/video-downloader-professi/elicpjhcidhpjomhibiffojpinpmmpil?hl=en) in Orca and with REA; [Video Download Helper](https://chromewebstore.google.com/detail/video-download-helper/lmjnegcaeklhafolokijcfjliaokphfk) public listing. REA `inspect_web_page` evidence ID: `ev_0a351bcef7e0cb5de725aaf755a084af01f1b626c6fe05747821b4a57aa89bb0`. This establishes public listing observations, not proprietary extension internals. No competitor code or assets were used and no competitor speed benchmark was performed.

Not verified: installation in Orca/Comet, extension-store review, all websites, large multi-gigabyte transfers, login-only websites, DRM, live streams or HLS/DASH merging. The extension was installed only in the disposable test browser.

## v0.2.0 popup and naming checks

Seven unit tests, syntax checks and the browser integration harness passed after the compact-popup update. The actual extension correctly grouped three related sources (two MP4 qualities and a WebM), retained separate unrelated videos, used the video title instead of the page title, displayed a supplied poster, and matched toolbar/popup counts. The popup fit within 600 px height and had no horizontal overflow.

Editing a filename survived a concurrent scan. Selecting another source preserved the custom name and changed its extension to the real media format. Both renamed Amharic MP4 and WebM files landed on disk with the expected names and SHA-256 hashes matching their selected source bytes. Saved-name edits persisted in local storage, and a typed `.webm` suffix normalized to `.mp4` when the selected file was MP4. Untrusted titles rendered as text. Existing discovery, save/remove, error, stream and navigation checks passed.

The harness restores native download behavior and sets a disposable browser download directory. Playwright's automation download override otherwise substitutes UUID artifact names (or bypasses extension filename handling), which cannot prove real user-visible naming. Personal browser settings were not changed.

Latest observed browser timings, including server/cache variation: initial local discovery with page load 873 ms; exact 1,410,297-byte local download 39 ms; public W3Schools MP4 0.53 s, MDN MP4 0.17 s, W3C MP4 2.70 s. All public MP4 headers and total byte counts were checked. These are observations, not a comparison or guaranteed speed increase.
