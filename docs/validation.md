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

## v0.3.0 real formats and stream downloads

REA inspected the installed reference's selected artifacts and recorded runtime observations on YouTube, MDN and W3Schools; see [reference-audit.md](reference-audit.md) for evidence IDs, version differences and limits. The reference's Chrome-store build blocked its YouTube download despite listing formats; its W3Schools download also showed a possibly-short-file warning. These are reported as such, without claiming general reference failure or a fair speed benchmark.

The independent implementation passed a real native-messaging handshake in an isolated Chrome for Testing profile. The test copy granted the optional permission at installation time; production requires the user's Connect local engine permission prompt. The native host was registered only inside that temporary browser profile, and its output folder was temporary. Personal Comet/Orca profiles and permissions were not modified.

Current yt-dlp 2026.10.26 with EJS 0.8.0, Python 3.13, Node and installed FFmpeg discovered 33 usable formats for the exact song `bg1sT4ILG0w`. Clicking the actual extension Download button completed:

- MP4: 256×128, full 305 seconds, 7,225,413 bytes.
- WebM: 1280×522, full 305 seconds, 30,478,504 bytes.

FFprobe independently confirmed both audio and video tracks and the selected dimensions in each completed file. A generated local HLS master/media playlist also downloaded and produced an output containing both video and audio. The older installed yt-dlp 2026.03.17 could discover formats but its download returned 403; upgrading only a separate project environment resolved that test failure.

Seven JavaScript tests and eight Python validation/protocol/cancellation-state tests pass, along with JavaScript/Python/shell syntax and ZIP verification. The existing real browser suite passed direct MP4/WebM quality selection, renamed Unicode filenames and source hashes, saved names, frame/MIME detection, untrusted text, navigation and HTTP errors. Public direct-file downloads passed W3Schools, MDN and W3C again.

Remaining limits: personal-browser engine installation/permission must be completed and verified by its user; native-messaging support differs between browsers. No all-websites or all-formats download claim, DRM, live recording, cookie export or guaranteed transfer speed. Cancellation validation covers pending/running state and process-group termination code; an interrupted real YouTube download was not used as a destructive cancellation test.

## v0.4.0 inline progress and broader recognition

Direct browser downloads now stay in their video row with percentage, received/total bytes, measured rate, estimated remaining time, Pause/Resume, Stop and Retry. The browser harness served a real MP4 slowly to verify each field while transferring, hid the source controls during the transfer, reopened the popup while it continued, paused/resumed it, and verified Chrome's `USER_CANCELED` state after Stop. Retry completed and its SHA-256 matched the entire source. Unknown-length chunked responses stayed indeterminate rather than showing invented percentages or totals. HEAD metadata recovered the slow file's size before download without reading its body. The native Downloads button, setup/close, dismiss, filename and prior discovery/error cases passed.

The local engine now combines video/audio track byte counts, reports remaining byte estimates, and emits the final output size. Approximate totals are labeled. Protocol version 2 is required so an older helper cannot silently supply incompatible per-track progress. Eleven media/progress checks plus two helper-version compatibility checks passed (13 JavaScript checks); nine Python checks include a deterministic two-track byte/ETA test. The actual generated HLS integration passed with video/audio tracks and nonzero progress/final size.

The real native-host browser test also started a local-engine job from the row, pressed Stop and confirmed its persisted `cancelled` state and restored Retry action. The complete WebM test observed live progress in the same row. These checks used an isolated browser/profile and output directory; personal browser helper registration was not changed.

Public direct MP4 checks completed on W3Schools, MDN and W3C. The exact YouTube song still exposed 33 formats. In this recheck, adaptive MP4 format 160 returned HTTP403. Separate actual extension downloads completed as progressive MP4 format 18 (640×262, 305 seconds, 14,570,072 bytes) and WebM format 247 (1280×522, 305 seconds, 30,478,504 bytes). FFprobe verified audio/video and dimensions; the WebM run observed live native progress and checked its final file size against FFprobe. These results do not mean all listed qualities or websites are downloadable.

A new transparent icon was generated with the image-generation tool. PNG alpha and exact 16/32/48/128 pixel dimensions were checked, and the toolbar/popup manifests reference those assets. SnapAI was configured but its generation request returned HTTP429/no credits; no key was exposed or changed.

[Mister Download Manager review](mdm-review.md) records the source/license review, independently implemented ideas and omitted desktop features. No GPL source or assets were copied. The broad-format tests cover recognition and safe filenames, not browser playback of every codec. Existing limits on DRM, live recording and browser-specific native setup remain.
