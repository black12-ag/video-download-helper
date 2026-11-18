# Video Download Helper Implementation Plan

Goal: a free extension that detects direct video files and downloads them without a service.
Architecture: plain MV3 JavaScript, browser downloads API, session/local storage, no dependencies.

- [x] Add core URL classification, safe filenames, deduplication and tests in extension/media.js and tests/media.test.js.
- [x] Add manifest, service worker, all-frame page scan, bounded session records, saved list and message validation.
- [x] Add accessible popup: current tab, saved list, scan, download, save/remove, native downloads and clear states.
- [x] Test classification and background lifecycle; load the extension in a disposable Chromium profile and verify actual detection and download against a local video fixture.
- [x] Add MIT license, privacy and installation/contribution documentation. Package extension-only ZIP, initialize Git and publish the clean source if GitHub access permits.
