---
package: '@flighthq/clipboard'
updated: 2026-08-29
by: builder4
---

# clipboard — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/clipboard/src/`, `packages/types/src/Clipboard*.ts`, and
the one native backend on 2026-08-08. Most of the old log checked out closed; what survives is below.

- **Change events remain an experimental Web-only surface.** `webClipboardBackend` exposes the static
  change capability but delivers only when the runtime supports `onclipboardchange`; the distinct-
  provider lifecycle is covered with observable listener sets, while a stable real-browser emitter is
  still unavailable.
- **The Electron atomic write silently misroutes two of the six canonical formats.** `formatKey`
  (`electronClipboard.ts:183-188`) recognizes `text/html`, `text/rtf`, and the bare string
  `'bookmark'`, and falls through to `'text'` for everything else — including
  `ClipboardFormatBookmark` (`'text/x-moz-url'`) and `ClipboardFormatImage` (`'image/png'`), the exact
  strings `hasClipboardBookmark` and the format constants hand callers. A
  bookmark or image item in a `writeClipboard` batch lands as plain text with no sentinel.
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

- **2026-08-29** — Replaced ambient `ClipboardBackend` resolution with explicit top-level Host slots
  derived from provider coverage; removed the Web enabler and the zero-provider files/change-count
  surface, and migrated Web/Electron/Tauri/Capacitor assemblers and consumers.
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
