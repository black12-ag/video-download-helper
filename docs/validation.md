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
