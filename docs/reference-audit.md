# Installed Video Download Helper audit — 2026-11-18

This investigation uses the installed SAS ACLAP Video Download Helper 10.7.1.2 artifacts and a disposable browser, not just its store listing. No proprietary code, source files, icons or thumbnails are copied into this project. The independent implementation uses maintained yt-dlp and FFmpeg.

## REA evidence

- Static selected manifest, Orca worker entry and YouTube injection: `ev_6035c3ac6a0fcdd195df45e7fc2e3c6fd170c96eff676e13032c388334e97e7e`.
- Static selected core service and factory: `ev_3129cf07c807c085bf8e07a4cc1c9ad94a809b475b11f9779e303b60c3718a77`.
- Runtime MDN page, reference loaded: `ev_b8cb8eb952f12c2581d661d20bba0e9911d72bb07b25d146ca9378b0c07df5e1`.
- Runtime W3Schools page, reference loaded: `ev_befd11c68ed7838d1a014e9d8914fd2e91fe3a7876b6d95e0fcce5d315d36a68`.
- Runtime exact YouTube song, reference loaded: `ev_157a2484eb030618fa3726401698527b151a100f086e5663f58ffddb0a8fc618`.

Static analysis read only selected sources; most inventoried files and indirect relationships remain outside scope. Static code does not prove a particular branch ran. Runtime screenshots and the browser download API were inspected separately. Raw artifacts/evidence remain local and are not bundled here.

## Observed design

The manifest declares site-specific injection for several providers, including YouTube/Vimeo, along with network observation and offscreen workers. The selected core contains separate strategy branches for YouTube formats, HLS and DASH, with video/audio source and muxer metadata. The YouTube injection obtains site visitor metadata; it is not merely an MP4 URL detector. Offscreen worker creation is explicit. A bundled WASM runtime exists, but these bounded checks do not establish its role in media muxing.

The running popup showed FMT/HLS rows, thumbnail/duration, title editing, quality selection and Download actions. Its content is in shadow DOM; plain `body.innerText` initially missed the UI, so visual screenshots and accessible controls were used instead. This explains why a simple page-media scan could not reproduce its behavior.

## Actual reference download checks

The owner explicitly approved accepting the reference's Terms in the disposable test profile. No payment, subscription, account creation, reporting or activation was submitted.

| Sample | Reference observation |
| --- | --- |
| MDN flower MP4 | Browser download completed, 1,130,982 bytes. Contents were not retained for an integrity/probe check. |
| W3Schools video page | Browser download completed, 586,561 bytes, but the reference also showed a network-interruption/possibly-short-file warning. This is not counted as a clean success. |
| Nico & Vinz song `bg1sT4ILG0w` | Discovered FMT/HLS qualities and preview; clicking Download showed a YouTube-not-allowed notice in the Chrome-store build. No browser download completed in the 40-second test window. |

The selected artifact in the disposable runtime was the Comet-installed Chrome-store build. Orca uses a rewritten worker entry/manifest around the same version. Their behavior should not be assumed identical. No license restriction or store restriction in the reference was patched or bypassed.

## Resulting independent changes

The v0.2 gap was functional: raw HLS detection was displayed as a disabled Download action, without a format extractor or merger. v0.3 adds an optional local yt-dlp/FFmpeg engine for that work, plus page thumbnails, grouping of repeated YouTube manifests, real dimensions/codecs/bitrate, actionable Find qualities controls, dismiss, and local progress/cancel. Direct browser downloads remain available without the helper.

An older installed yt-dlp could list 19 formats but got HTTP 403 on download. In a separate project environment, current yt-dlp 2026.10.26 with EJS 0.8.0 and Node discovered 33 usable formats. The real extension/native-host test downloaded the full song as a selected low-resolution MP4 and verified duration, dimensions and both video/audio tracks with FFprobe. Further validation results are recorded in `docs/validation.md`. This establishes tested capability, not universal website coverage or superiority in transfer speed.
