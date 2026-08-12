---
package: '@flighthq/clipboard'
updated: 2026-08-08
by: principal
---

# clipboard — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/clipboard/src/`, `packages/types/src/Clipboard*.ts`, and
the one native backend on 2026-08-08. Most of the old log checked out closed; what survives is below.

- **No backend in the tree ever delivers a change event, so `ClipboardWatch` never fires.** The web
  backend subscribes only when the nonstandard `'onclipboardchange' in window` probe passes
  (`clipboard.ts:200-207`) and otherwise returns an inert unsubscribe; `createElectronClipboardBackend`
  returns an inert unsubscribe unconditionally (`host-electron/src/electronClipboard.ts:166`). Both
  `getChangeCount` implementations return `-1` (`clipboard.ts:197`,
  `electronClipboard.ts:162`). `attachClipboardWatch` is therefore untested against a real emitter.
- **The Electron atomic write silently misroutes two of the six canonical formats.** `formatKey`
  (`electronClipboard.ts:183-188`) recognizes `text/html`, `text/rtf`, and the bare string
  `'bookmark'`, and falls through to `'text'` for everything else — including
  `ClipboardFormatBookmark` (`'text/x-moz-url'`) and `ClipboardFormatImage` (`'image/png'`), the exact
  strings `hasClipboardBookmark` and the format constants hand callers. A
  bookmark or image item in a `writeClipboard` batch lands as plain text with no sentinel.
- **`has*` is missing the files flavor.** `readClipboardFiles` / `writeClipboardFiles` exist
  (`clipboard.ts:285`, `:330`) with no `hasClipboardFiles`, breaking the otherwise complete
  read/write/has triple that text, HTML, RTF, image, and bookmark all have.
- **`RTF` is cased against the rest of the SDK.** `hasClipboardRTF` / `readClipboardRTF` /
  `writeClipboardRTF` (`clipboard.ts:265`, `:305`, `:350`) shout the acronym while the constant it
  routes through is `ClipboardFormatRtf` (`types/src/ClipboardFormat.ts:4`). Pre-release, one of the
  two spellings should go.
- **Four roadmap surfaces are absent from the whole tree** — a `ClipboardScope` secondary-pasteboard
  selector, the binary `readClipboardBuffer` / `writeClipboardBuffer` seam, `writeClipboardLazy`
  promised rendering, and `getClipboardCapabilities`. Grep across `packages/**/*.ts` returns zero
  hits for each. The binary seam is the load-bearing one: the generic flavor seam
  (`ClipboardBackend.readFormat` / `writeFormat`, `types/src/Clipboard.ts:37-39`) is string-only, so a
  non-text custom format has no lossless path even though Electron's `readBuffer`/`writeBuffer` sit
  right under it.
- **The `Bitmap` image flavor is a standing design question, not just unbuilt.** Today images cross
  as data URLs (`Clipboard.ts:23-26`). A `readClipboardBitmap(out)` / `writeClipboardBitmap(bitmap)`
  pair needs a ruling on whether `@flighthq/clipboard` may take a type-only `Bitmap` dependency, and
  whether the data-URL functions stay as a permanent web convenience.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 "concern" that Electron's
  `writeItems` loops per format and that `ElectronClipboard` lacks `write()` is **false**:
  `electronClipboard.ts:144-149` builds one `ElectronClipboardData` and calls `cb.write(data)` once.
  The 2026-06-25 blocker "the `ClipboardFormat*` constants are NOT present in `@flighthq/types`" is
  also false — `types/src/ClipboardFormat.ts:1-6` defines all six and `clipboard.ts:3` imports three.
- **2026-07-30** — Stale-cell audit; removed the nonstandard `window.clipboardchange` property check
  from the change-event capability test and added a regression proving it activates no subscription.
- **2026-06-25** — Widened the package description; folded the repeated web write-path guard behind
  `getWritableWebClipboard()` and the image-data-URL conversion behind `blobFromFormatData`.
- **2026-06-24** — Landed the generic MIME flavor seam, the complete `has*` set, atomic
  `writeClipboard` / batch `readClipboard`, the file flavor, and the `ClipboardWatch` lifecycle.
