# Compact popup — v0.2.0

Owner requested a simpler extension UI, automatic video names and editable filenames, using five supplied screenshots and Mobbin references. The main path is now video → available quality → optional rename → Download. Existing discovery and native downloading remain intact.

The popup is 500 px wide and fits within 600 px height. It shows compact rows with a lazy-loaded poster (or local placeholder), duration when available, an editable filename, quality/format/size selector, Download and Save. Only files explicitly associated with one video element are grouped; unrelated media is never combined just because it shares a page title. The first direct source with the highest known dimensions is selected initially. Unsupported streams remain clearly labeled and cannot be downloaded as broken files.

Video titles prefer the media's accessible label, title or figure caption, followed by page metadata/title. Specific names survive later network responses. User names are sanitized at the download boundary, support Unicode, retain the real media format and stay within a conservative filename byte limit. Saved entries remember their edited names. Existing saved entries without the new fields remain compatible.

No additional permissions or runtime dependencies. Poster requests go only to the original image host, with no referrer; privacy notes disclose them. No autoplay previews, external fonts, converters, settings panel, download-history database or fake quality/bitrate/speed figures. Network-driven popup updates are batched, and editing/selection is preserved while discoveries arrive.

References inspected on Mobbin:

- [Vimeo download dialog](https://mobbin.com/screens/08e37fe8-2567-46a6-ad82-6b6b2dc9b383): resolution, file size and download action kept together.
- [Adobe Express download panel](https://mobbin.com/screens/f9b5b9eb-259d-4208-bc95-13ba3af9bfac): compact source-format controls and a clear primary action.

The implementation is original. Mobbin preview images and the owner's screenshots are not bundled in the extension or public repository.

Validation adds regression checks for naming, title precedence, safe Unicode filenames and grouping. The real extension browser harness verifies posters, source-quality selection, matching source bytes, Unicode names on disk, saved-name persistence, format normalization, no editing interruption, popup bounds, and untrusted-title rendering, alongside the existing discovery/download/error checks.
