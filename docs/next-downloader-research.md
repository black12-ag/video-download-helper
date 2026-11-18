# Research: a separate account-aware downloader

Status: superseded. The owner explicitly corrected the choice to ONLY A BROWSER EXTENSION and canceled the desktop proposal before implementation. See extension-only-plan.md. Netflix download capability remains unverified/unsupported.

## Owner's goal

A separate, better app for videos the owner can already view, including signed-in websites. Netflix remains a priority. The current extension's successful playback check and the reference extension's empty detection UI do not establish a downloadable Netflix file or a validated recording path.

## Findings checked on 2026-11-18

- [yt-dlp's FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ) explains that extracted media can require the same IP, cookies and request headers. A per-site, explicitly approved browser-session connection could expand authenticated non-DRM coverage; a generic URL-only downloader cannot promise the same access.
- [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE/blob/main/README.en.md) supports HLS/DASH/MSS and supplied headers/cookies. Its encrypted-stream options accept decryption keys as inputs. That is not evidence it can obtain Netflix keys or make a subscribed browser session exportable. No keys, cookies or license responses were collected here.
- [PlayOn's vendor FAQ](https://www.playon.tv/faq) describes a Windows recording product for subscription services, including Netflix; some functionality requires a plan. Its cloud workflow can deliver recordings to Mac/PC. This is a vendor claim, not our tested result, and it is not a free open-source Netflix engine. No account information was submitted or purchase made.
- [Lux](https://github.com/iawia002/lux/blob/master/README.md) has a provider/extractor model and authenticated adaptation for some supported sites. Provider lists do not establish universal or Netflix support.

## Approaches

1. **Separate desktop app plus browser connection (recommended for our own product).** Reuse the existing yt-dlp/FFmpeg engine and tested transfer model. Add an explicitly approved connection for each signed-in site; retain session material only as needed on this device and send it only to matching provider origins. Download direct files and supported manifests, choose quality/audio/subtitles, and manage queue/retries. Account access is still not a DRM license export. This approach must not advertise Netflix support without a completed playable-output test.
2. **Extend only the existing extension/helper.** Less UI/setup work and more reuse, but the same extractor/DRM limits remain. It does not meet the request for a distinct desktop experience as well.
3. **Investigate recording first for Netflix.** Validate a real, playable result through a supported playback-recording workflow before building an integration around it. Recording can take real time, can be blocked by the playback platform, and vendor solutions may cost money. A generic screenshot/screen recorder is not assumed to capture protected video correctly.

## Proposed first scope, awaiting owner selection

Mac-first desktop app for the current machine, with a browser connection, explicit per-site session approval, direct/HLS/DASH discovery, quality/audio/subtitle choices, byte progress/ETA, and a queue with retry. Reuse the current engine rather than rewriting media transport. Prototype any recording path separately and mark support only after a complete playable-output test. Never store credentials, session cookies or decryption material in Git, logs, reports or shared memory. Do not silently export all browser cookies or change browser protections.

Required decision: build the broader desktop app first, or validate a Netflix-specific recording route first. The latter is the better first validation if Netflix is the non-negotiable outcome; otherwise it would be easy to ship another broad downloader while missing the owner's main need.
