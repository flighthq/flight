---
package: '@flighthq/clipboard'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - types (Clipboard.ts, ClipboardFormat.ts, ClipboardWatch.ts, Host.ts HasClipboard* traits)
  - host-web/src/webClipboard.ts
  - host-web/src/webClipboardHost.ts
  - host-electron/src/electronClipboard.ts
  - platform-integration.md
  - prior review (2026-07-30)
  - prior assessment (2026-07-30)
---

# clipboard -- Review

## Verdict

**Solid -- 82/100.** The package is a well-shaped, explicit clipboard transport layer with 25 public
functions, clean dependency structure, and full adherence to the five-slot Host group model. The
2026-08-29 refactor removed ambient backend resolution and promoted clipboard to a top-level Host group
with provider-derived slots (text, image, formats, bookmark, change), which aligns with the charter's
latest decision. Every function takes the narrow `HasClipboard*` trait it needs rather than a monolithic
host. The casing inconsistency (`RTF` in function names vs `Rtf` in type constants) is the most
visible contract tension. Remaining distance is in test depth for success paths, the standing
image-model design question, and the `formatKey` misrouting in the Electron backend.

## Present capabilities

**25 exported functions** in a single `clipboard.ts` source file:

- **Text:** `readClipboardText`, `writeClipboardText`, `hasClipboardText`, `clearClipboard` -- all
  take `HasClipboardText`.
- **Image:** `readClipboardImage`, `writeClipboardImage`, `hasClipboardImage` -- take
  `HasClipboardImage`; images cross the boundary as data-URL strings.
- **Formats (HTML, RTF, generic MIME):** `readClipboardHtml`, `writeClipboardHtml`, `hasClipboardHtml`,
  `readClipboardRTF`, `writeClipboardRTF`, `hasClipboardRTF`, `readClipboardFormat`,
  `writeClipboardFormat`, `hasClipboardFormat`, `getClipboardFormats` -- all take
  `HasClipboardFormats`. Named conveniences delegate to the same backend; the generic `readClipboardFormat`/`writeClipboardFormat` seam is open to arbitrary MIME strings.
- **Multi-format batch:** `readClipboard` (multi-format read; missing formats omitted),
  `writeClipboard` (atomic multi-format write via `ClipboardWriteItem[]`).
- **Bookmark:** `readClipboardBookmark`, `writeClipboardBookmark`, `hasClipboardBookmark` -- take
  `HasClipboardBookmark`.
- **Change observation:** `createClipboardWatch`, `attachClipboardWatch`, `detachClipboardWatch`,
  `disposeClipboardWatch` -- the standard signal entity lifecycle. `attachClipboardWatch` takes
  `HasClipboardChange`, whose `change` field requires both `subscribe` and `unsubscribe`.

**Export lanes** are correct: `contract.ts` re-exports `./clipboard`, `index.ts` re-exports
`./contract`. Both `.` and `./contract` subpaths are declared in `package.json`.

**Dependencies** are minimal: runtime `@flighthq/signals` (for `createSignal`/`emitSignal`) and
`@flighthq/types`; dev-only `@flighthq/entity` (for test helpers). No import from `@flighthq/sdk`.

**Side effects:** `sideEffects: false` declared. The only module-scoped state is the
`_watchSubscriptions` Map at the bottom of the file (explicit registry, not a side effect of import).

**All exported types live in `@flighthq/types`:** `ClipboardBookmark`, `ClipboardWriteItem`,
`ClipboardWatch`, `ClipboardBookmarkBackend`, `ClipboardChangeBackend`, `ClipboardFormatsBackend`,
`ClipboardImageBackend`, `ClipboardTextBackend`, the six `ClipboardFormat*` constants, and the five
`HasClipboard*` traits in `Host.ts`.

**Host backends** implementing clipboard:
- **Web** (`host-web`): text, image, formats, change -- exposed via `webClipboardBackend` const and
  assembled as `webClipboardHost`. No bookmark support (Web Clipboard API has no bookmark concept).
- **Electron** (`host-electron`): text, image, formats, bookmark -- via
  `createElectronClipboardBackend`. No change events.
- **Tauri** (`host-tauri`): text only.
- **Capacitor** (`host-capacitor`): text and image.

## Tests

The test file (`clipboard.test.ts`) has 27 `describe` blocks (one per export) with `toBeTypeOf`
export-existence checks for each function. Two substantive test groups cover real behavior:

- `describe('clipboard')` tests a full round-trip through a `fakeBackend()` that implements all five
  backend interfaces, covering write-then-read for text, HTML, image, RTF, bookmark, and custom
  format; multi-format `readClipboard`/`writeClipboard`; all `has*` checks; `getClipboardFormats`;
  and `clearClipboard`. A second case proves two independent hosts never cross-read.
- `describe('ClipboardWatch')` tests attach/detach/re-attach across two hosts, idempotent attach,
  and dispose.

The `fakeBackend` uses `createEntity` to build a proper entity, assigns to the five-slot host shape
via `hostFor()`, and the tests exercise the real `clipboard.ts` functions end-to-end against it.

**Test depth gap:** All tests exercise the `@flighthq/clipboard` functions against an in-memory
fake. No tests in this package exercise a web or native backend, which is appropriate -- backend
testing belongs in the host packages. However, the round-trip test covers only success paths; there
is no test for the sentinel returns when a backend denies access (returning `false`, `''`, `null`).

## Gaps

1. **RTF casing inconsistency.** The exported functions are `hasClipboardRTF`, `readClipboardRTF`,
   `writeClipboardRTF` (uppercase `RTF`), but the type constant is `ClipboardFormatRtf` and the
   backend interface methods are `readRTF`/`writeRTF`. The function names and the constant disagree:
   `RTF` reads as an acronym shouted in isolation, while `Rtf` matches the PascalCase convention used
   by `ClipboardFormatHtml`. The charter's status.md flags this: "one of the two spellings should go."

2. **No sentinel/denial tests.** The functions document sentinel behavior (`''`, `false`, `null`,
   `[]`) when access is denied, but no test exercises a backend that returns those sentinels. The
   round-trip test's `fakeBackend` always succeeds.

3. **Electron `formatKey` misrouting.** `formatKey` in `host-electron/src/electronClipboard.ts:182-187`
   maps MIME strings to Electron's clipboard.write keys. It recognizes `'text/html'`, `'text/rtf'`,
   and the bare string `'bookmark'`, but falls through to `'text'` for everything else -- including
   `ClipboardFormatBookmark` (`'text/x-moz-url'`) and `ClipboardFormatImage` (`'image/png'`). A
   bookmark or image item in a `writeClipboard` batch silently lands as plain text. This is a
   host-electron defect, not a clipboard defect, but it breaks the clipboard contract for Electron
   users.

4. **Image model remains data-URL only.** Images cross the boundary as data-URL strings
   (`readClipboardImage`/`writeClipboardImage`). No `readClipboardBitmap`/`writeClipboardBitmap` pair
   exists. The charter's Open directions correctly leave this as a design question.

5. **No binary buffer path.** The generic format seam (`readClipboardFormat`/`writeClipboardFormat`)
   is string-only. A non-text custom format (e.g. a proprietary binary clipboard format) has no
   lossless path, even though Electron's `readBuffer`/`writeBuffer` sit right under the host
   implementation.

6. **No secondary pasteboard selector.** `ClipboardScope` (system/selection/find) is absent from the
   tree entirely. Linux PRIMARY selection and macOS find pasteboard have no path.

7. **No lazy/promised rendering.** `writeClipboardLazy` (deferred clipboard rendering, where the
   payload is computed only when a paste target requests it) is absent.

8. **No capability introspection.** `getClipboardCapabilities` does not exist. A caller cannot
   discover at runtime which slots a given host supports without attempting an operation.

9. **Web change observation is experimental.** `webClipboardBackend` checks for `onclipboardchange`
   in `window` and falls silent otherwise. No polling fallback. No capability query for callers who
   require change notification.

10. **Stale dist output.** The built `dist/index.d.ts` still exports `explainClipboardBackend`,
    `getClipboardChangeCount`, `readClipboardFiles`, and `writeClipboardFiles` -- functions that were
    removed in the 2026-08-29 refactor. A `npm run build` in the workspace would resolve this; it is
    a build-cache artifact, not a source defect.

## Charter contradictions

None found. The charter says clipboard owns "pasteboard transport, not the data types it carries;
drag-and-drop remains a separate capability." The implementation is pure transport: no pixel types, no
file I/O, no drag-and-drop. The charter's decision to "derive slots from provider coverage" and
"remove ambient backend resolution and unsupported sentinel methods" is faithfully reflected in the
current source -- every function takes the narrow `HasClipboard*` trait, and the removed
`explainClipboardBackend`/`getClipboardChangeCount`/file-list surface is gone from source (dist is
stale but that is a build artifact).

The charter correctly identifies image model and scope as open directions, and the source does not
prematurely implement either.

## Contract and docs fit

**(a) Package against the contract:**

- Types are in `@flighthq/types` -- all interfaces, the `ClipboardWatch` type, the format constants,
  and the `HasClipboard*` traits. No exported types defined in the package itself.
- Function names are full and unabbreviated: `readClipboardBookmark`, `writeClipboardFormat`,
  `hasClipboardImage`, etc. Globally self-identifying.
- Sentinel returns for expected failures: `''` for missing text/format, `null` for missing bookmark,
  `false` for denied writes, `[]` for denied format listing. No throws for expected cases.
- `sideEffects: false` declared. No registration at import.
- Two blessed export lanes (`.` and `./contract`), correctly wired.
- `dispose*` (not `destroy*`) is used for `disposeClipboardWatch`, which detaches listeners for GC
  eligibility -- correct verb per the convention.
- The `_watchSubscriptions` Map is at the bottom of the file, after exported functions, per style
  rules.
- Functions are alphabetized within the source file.
- `import type` is on its own line, separate from value imports.

**(b) Candidate contract/docs revisions:**

- **RTF casing should be settled SDK-wide.** The `ClipboardFormatsBackend` interface uses `readRTF`/
  `writeRTF` (matching the exported function names), while the constant is `ClipboardFormatRtf`.
  Either the constant should become `ClipboardFormatRTF` or the functions/methods should become
  `readClipboardRtf`/`writeClipboardRtf`/`hasClipboardRtf`/`readRtf`/`writeRtf`. The inconsistency
  spans `@flighthq/types`, `@flighthq/clipboard`, `@flighthq/host-web`, and `@flighthq/host-electron`.

## Candidate open directions

These are questions the charter does not answer that this review had to assume or leave unresolved:

1. **RTF casing convention.** Should the SDK use `RTF` (acronym convention, matching `URL`, `HTML` in
   function names) or `Rtf` (PascalCase convention, matching `ClipboardFormatHtml`)? The constant
   uses `Rtf`; the functions and backend methods use `RTF`. This should be settled as a charter
   decision or an SDK-wide naming convention.

2. **Capability introspection.** Should a `getClipboardCapabilities` function exist that returns
   which slots (text, image, formats, bookmark, change) a given host provides? Today a caller must
   attempt an operation or inspect the host type at compile time.

3. **Binary buffer transport.** Should the generic format seam support binary (`ArrayBuffer` /
   `Uint8Array`) in addition to string? This intersects with the image-model question but is broader
   -- any non-text clipboard format needs it.
