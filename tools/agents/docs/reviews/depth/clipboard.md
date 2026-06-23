# Depth Review: @flighthq/clipboard

**Domain**: System clipboard access — read/write of the OS pasteboard across data flavors (plain text, HTML, image, RTF, URL/bookmark), behind a swappable web/native backend.

**Verdict**: solid — 78/100

The package covers the data flavors a mature cross-platform clipboard API is expected to expose, with a clean command-capability seam (`get*Backend`/`set*Backend`/`createWeb*Backend`) consistent with the platform suite. It is more than a stub: text, HTML, image, RTF, and bookmark flavors are all present with both read and write, plus `has*` probes and `clear`. It falls short of "authoritative" mainly because the format model is fixed (no arbitrary MIME flavor read/write, no multi-flavor atomic write, no change-count/event signal), which are the features that distinguish a comprehensive clipboard library (Electron `clipboard`, NSPasteboard, the W3C Async Clipboard API) from a convenience wrapper.

## Present capabilities

Free functions (each delegating to the active `ClipboardBackend`):

- Plain text: `readClipboardText`, `writeClipboardText`, `hasClipboardText`.
- HTML: `readClipboardHtml`, `writeClipboardHtml`.
- Image (as data URL): `readClipboardImage`, `writeClipboardImage`, `hasClipboardImage`.
- RTF: `readClipboardRTF`, `writeClipboardRTF`.
- Bookmark (title + URL pair): `readClipboardBookmark`, `writeClipboardBookmark`.
- `clearClipboard`.
- Backend seam: `getClipboardBackend` (lazy web default — always a backend), `setClipboardBackend` (null restores web default), `createWebClipboardBackend`.

The web backend is genuinely complete for what the platform allows: it uses `navigator.clipboard.read()`/`write()` with `ClipboardItem`, iterates item types for HTML / `image/*` / `text/rtf`, reads images via `FileReader` → data URL, writes images by `fetch(dataUrl)` → `Blob`. Every path guards for missing API / non-secure context / jsdom and returns the documented sentinel (`''` / `false` / `null`) rather than throwing — matching the codebase's expected-failure rule exactly. Bookmark read/write correctly returns the no-op sentinel on web (no web bookmark flavor) and is left for a native host. Test coverage mirrors every export with both a backend-roundtrip case and a web-sentinel case.

## Gaps vs an authoritative clipboard library

These are the features a canonical clipboard library (Electron `clipboard`, AppKit `NSPasteboard`, GTK, the W3C Async Clipboard API) provides that are absent here. Most are missing-by-omission, not by-design:

- **Arbitrary / custom MIME flavors.** No generic `readClipboard(format)` / `writeClipboard(format, data)` or `read(formats[])`/`write(items[])`. The flavor set is hard-coded to text/HTML/image/RTF/bookmark. Authoritative APIs expose `readBuffer(format)`/`writeBuffer(format, buffer)` (Electron) or arbitrary UTType/MIME entries (NSPasteboard/Async Clipboard), which is the single biggest depth gap — apps with custom paste formats cannot be served.
- **Available-formats enumeration.** No `getClipboardFormats()` / `availableTypes()`. Electron's `clipboard.availableFormats()` and `NSPasteboard.types` are standard; here the only introspection is `hasText`/`hasImage` (and notably **no `hasClipboardHtml` / `hasClipboardImage`-RTF / `hasBookmark`** — the `has*` set is asymmetric with the flavors offered).
- **Atomic multi-flavor write.** No way to place text + HTML (+ image) on the clipboard in one write so a target picks its best representation. Each `write*` here issues a separate `ClipboardItem` write that overwrites the previous one — the canonical "rich copy" (plain + styled fallback together) is impossible.
- **Image type fidelity.** Images are modeled only as data-URL strings. There is no native image type (e.g. an `ImageSource`/`NativeImage` analogue), no PNG/JPEG selection, no size/scale handling. For an SDK that owns `@flighthq/surface` / `ImageSource`, routing clipboard images through a data-URL string rather than a pixel buffer is a notable seam mismatch.
- **Change notification.** No `onClipboardChange` signal or change-count poll (`NSPasteboard.changeCount`). Many editor/clipboard-manager use cases need to observe external clipboard changes; this is an event-capability concern the package does not address.
- **Selection / find clipboards.** No concept of multiple pasteboards (Linux PRIMARY selection, macOS find pasteboard). Reasonably out of scope for a baseline, but a fully authoritative library names them.
- **Files / file paths.** No `readClipboardFiles` / file-list flavor (Electron `readBuffer('FileNameW')`, NSPasteboard file URLs). Common for desktop paste.

## Naming / API-shape notes

- Naming is on-spec: every exported function carries the full unabbreviated `Clipboard` type word, is globally self-identifying, uses `read*`/`write*`/`has*`/`clear*` verbs, and the command-capability seam matches the platform-suite contract described in the codebase map. Alphabetization holds.
- `RTF` is left uppercased in `readClipboardRTF`/`writeClipboardRTF` (acronym), consistent with `readClipboardHtml` being title-cased — minor inconsistency (HTML lowercased, RTF uppercased) but both are defensible acronym conventions.
- The `has*` surface is incomplete relative to the flavors: only `hasText`/`hasImage` exist. An authoritative shape would either provide `has*` for every flavor or replace them with a single `getClipboardFormats()` enumeration that subsumes all of them.
- Image-as-data-URL (`string`) is the most questionable shape decision for depth; a typed image/buffer flavor would integrate with the SDK's own image types and avoid base64 round-tripping.
- Backend lives in `@flighthq/types` (`ClipboardBackend`, `ClipboardBookmark`) per the header-layer rule — correct.

## Recommendation

Treat as **solid baseline, not authoritative**. To reach AAA depth for the clipboard domain, prioritize: (1) a generic format seam — `readClipboardFormat(mime)` / `writeClipboardFormat(mime, data)` and `getClipboardFormats()` — to lift the hard-coded flavor ceiling; (2) atomic multi-flavor write so a rich copy carries text + HTML together; (3) a typed image flavor over the SDK's `ImageSource` instead of data-URL strings; (4) complete the `has*` set or replace it with format enumeration. An `onClipboardChange` event capability and file-list flavor are the next tier. Bookmark/native-only gaps are correctly missing-by-design (no web format); the gaps above are missing-by-omission and are what separate this from an exhaustive clipboard library.
