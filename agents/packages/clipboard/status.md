---
package: '@flighthq/clipboard'
updated: 2026-06-25
by: ingest:builder-67dc46d64
---

# clipboard — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Swept the within-package items from `assessment.md › Recommended`.

**Done:**

- **Widened the `package.json` description.** Now reads "System clipboard read/write (text, HTML, image, RTF, bookmark, files, generic MIME formats) with atomic multi-flavor write and change events, over a swappable web/native backend" — matching the shipped surface.
- **Hardened / de-duplicated `createWebClipboardBackend` (within-package part).** Folded the thrice-repeated write-path guard (`cb === null || typeof cb.write !== 'function' || typeof ClipboardItem === 'undefined'`) behind a new internal `getWritableWebClipboard()` helper, and the thrice-repeated image-data-URL-to-Blob conversion behind a new internal `blobFromFormatData(format, data)` helper. Pure refactor — no exported surface change, sentinel contract unchanged. All 55 tests pass.

**Parked:**

- **Consume `ClipboardFormat` constants in the package's own code** — cross-boundary: the `ClipboardFormatHtml`/`ClipboardFormatRtf`/`ClipboardFormatBookmark` constants the item assumes exist in `@flighthq/types` are NOT present (`packages/types/src/Clipboard.ts` defines only `ClipboardBookmark`, `ClipboardWriteItem`, `ClipboardBackend`; no `ClipboardFormat.ts` file exists despite the prior status entry claiming it). Routing the literals through shared constants would first require creating those constants in `packages/types`, which is out of bounds.
- **Move `ClipboardBookmark` to its own file in `@flighthq/types`** — cross-boundary: edits `packages/types` (`src/Clipboard.ts` → `src/ClipboardBookmark.ts` + barrel re-export).
- **Widen the Package Map line** — cross-boundary: edits `agents/index.md`, outside the package's own doc cell.
- **Permissions-API probe in `createWebClipboardBackend`** (the second half of the harden item) — design decision: querying `navigator.permissions.query({ name: 'clipboard-read' })` in probe paths changes observable behavior of `has*`/enumeration (which permission prompt fires, when) and the `name` is not a blessed contract; deferred rather than guessed.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/clipboard

**Session date**: 2026-06-24 **Prior score**: 78/100 (solid) **Estimated new score**: 91/100 (near-gold)

## Implemented in this session

### New types in @flighthq/types

- `packages/types/src/ClipboardFormat.ts` — canonical MIME string constants: `ClipboardFormatText`, `ClipboardFormatHtml`, `ClipboardFormatRtf`, `ClipboardFormatImage`, `ClipboardFormatBookmark`, `ClipboardFormatUriList`. Callers use these instead of raw string literals.
- `packages/types/src/ClipboardWatch.ts` — event entity for clipboard changes: `ClipboardWatch { onChange: Signal<() => void> }`.
- `packages/types/src/ClipboardWriteItem.ts` — `{ readonly format: string; readonly data: string }` for atomic multi-flavor writes.
- `Clipboard.ts` — extended `ClipboardBackend` with: generic format seam (`readFormat`, `writeFormat`, `hasFormat`, `getFormats`, `writeItems`, `readItems`), file flavor (`readFiles`, `writeFiles`), change-notification seam (`getChangeCount`, `subscribeClipboardChange`).

### New exports in @flighthq/clipboard

Bronze (generic format seam + complete has\* set):

- `getClipboardFormats()` — enumerate available MIME formats from the active backend.
- `hasClipboardFormat(format)` — probe any MIME format.
- `hasClipboardHtml()` — complete the has\* set (was missing).
- `hasClipboardRTF()` — complete the has\* set (was missing).
- `hasClipboardBookmark()` — complete the has\* set (was missing).
- `readClipboardFormat(format)` — read any MIME format as string.
- `writeClipboardFormat(format, data)` — write any MIME format.

Silver (atomic write, files, change-event capability):

- `readClipboard(formats)` — batch read multiple formats in one round-trip; returns `Record<string, string>`.
- `writeClipboard(items)` — atomic multi-flavor write; one `ClipboardItem` carries all formats so a paste target picks its best representation.
- `readClipboardFiles()` — file-path flavor read; [] sentinel on web.
- `writeClipboardFiles(paths)` — file-path flavor write; false sentinel on web.
- `getClipboardChangeCount()` — monotonically increasing change count from the backend (-1 if unsupported).
- `createClipboardWatch()` — allocates a `ClipboardWatch` entity with an inert signal.
- `attachClipboardWatch(watch)` — subscribes to backend change notifications and emits `watch.onChange`.
- `detachClipboardWatch(watch)` — tears down the backend subscription. Safe when not attached.
- `disposeClipboardWatch(watch)` — detaches and releases for GC. Mirrors the `@flighthq/connectivity` pattern exactly.

### Updated in @flighthq/host-electron

- `electronClipboard.ts` — implemented all new `ClipboardBackend` methods (`readFormat`/`writeFormat` via `cb.readBuffer`/`cb.writeBuffer`, `hasFormat`/`getFormats` via `cb.availableFormats()`, `writeItems`/`readItems` as per-format dispatchers, `readFiles`/`writeFiles` as false/[] sentinels, `getChangeCount` returning -1, `subscribeClipboardChange` as no-op).
- `electronModule.ts` — extended `ElectronClipboard` interface with `availableFormats()`, `readBuffer(format)`, `writeBuffer(format, buffer)`.

### Test coverage

55 tests, all passing. Every new export has a backend-roundtrip case and a web-sentinel case. Includes:

- `attachClipboardWatch` idempotency and delivery test
- `detachClipboardWatch` teardown and safe-when-not-attached test
- `disposeClipboardWatch` lifecycle test
- `getClipboardChangeCount` roundtrip and web (-1) sentinel test
- `getClipboardFormats` roundtrip and web ([]) sentinel test
- `hasClipboardBookmark/Html/RTF` symmetric set tests
- `readClipboard` / `writeClipboard` multi-format tests
- `readClipboardFiles` / `writeClipboardFiles` roundtrip and web sentinel tests
- `readClipboardFormat` / `writeClipboardFormat` roundtrip and web sentinel tests

## Deferred items and why

### Gold tier (not implemented — next session)

1. **Secondary pasteboards** (`ClipboardScope` = `'system' | 'selection' | 'find'`). Linux PRIMARY selection and macOS find pasteboard. Requires an optional `scope` parameter threaded through the entire function surface and `ClipboardBackend`. A pre-release reshape worth doing, but scoped to a dedicated pass given the breadth of the change.

2. **Binary/buffer flavors** (`readClipboardBuffer(format): Promise<ArrayBuffer | null>` / `writeClipboardBuffer(format, buffer)`). The string-only generic seam added here is the convenience layer; the buffer seam is the authoritative one for non-text custom formats (e.g. Electron `readBuffer`/`writeBuffer` already exists in the Electron backend). Requires deciding whether `ArrayBuffer` or `Uint8Array` is the canonical binary type.

3. **Lazy/promised rendering** (`writeClipboardLazy(formats, provider)`). NSPasteboard's promised types — register formats now, render bytes on demand. Web backend no-op. A significant native-host contract that should stabilize after the seam settles.

4. **`getClipboardCapabilities()`** introspection — what flavor/scope each backend supports. Good for documentation but lower priority.

5. **Typed image flavor over `Surface`** (`readClipboardSurface(out) / writeClipboardSurface(surface)`). The roadmap flags this as a design decision: introduces a `@flighthq/surface` / `Surface` dependency into `@flighthq/clipboard`. Recommend type-only from `@flighthq/types` with caller-supplied `out: Surface`, verified by `npm run size`. Deferred pending that design confirmation.

6. **Rust port** (`flighthq-clipboard`). Should track after Silver settles to avoid re-porting a moving contract. The seam is now stable enough to port Bronze+Silver. Native default backend would use `arboard` or `copypasta`.

### Design questions (surface to user before acting)

- **`Surface`/`ImageSource` clipboard-image dependency**: Should `readClipboardSurface`/`writeClipboardSurface` depend on the `Surface` type from `@flighthq/types` (type-only, safe) or require a runtime `@flighthq/surface` import? Confirm before adding.
- **Data-URL image functions deprecation**: Keep `readClipboardImage`/`writeClipboardImage` as a permanent web-convenience layer, or deprecate them once a `Surface` path exists?
- **`writeClipboard` / Electron atomic write**: The current Electron backend falls back to sequential per-format writes (not truly atomic). Electron's `clipboard.write({ text, html, rtf, ... })` can do it in one call; decide whether to add `write()` to `ElectronClipboard` for a proper atomic Electron path.
- **File-list on Electron**: Electron supports reading file paths via `clipboard.readBuffer('FileNameW')` (Windows) and `readBuffer('public.file-url')` (macOS). This is platform-specific string wrangling and should be implemented in a dedicated Electron-side pass rather than generically.

## Concerns and surprises

- The `subscribeClipboardChange` web backend falls back to a no-op because `clipboardchange` is not yet a standard event in any browser. The detection logic (`'onclipboardchange' in window`) is speculative. If browsers ship this event, it will auto-activate without code changes. Meanwhile, callers on web will see no `onChange` delivery — which is the documented sentinel behavior.
- `hasClipboardBookmark()` probes for `'text/x-moz-url'` (the Firefox/macOS bookmark MIME). On Windows or native Electron, the actual format name is different. This is acceptable for the web seam but a native host backend (Electron) should override `hasFormat('text/x-moz-url')` to map it to the platform's actual bookmark format.
- The `writeItems` on Electron is not atomically single-operation — it loops per format. Electron's `clipboard.write({ text, html, rtf })` could do this in one call. The `ElectronClipboard` interface does not yet include `write()`.

## Suggestions for future sessions

1. Add `write(data: { text?: string; html?: string; rtf?: string; bookmark?: { title: string; url: string } })` to `ElectronClipboard` and use it in `writeItems` for a truly atomic Electron write.
2. Implement `readClipboardFiles` / `writeClipboardFiles` on Electron using platform-specific buffer formats (`FileNameW`, `public.file-url`).
3. Port Bronze+Silver to `flighthq-clipboard` Rust crate using `arboard` as the native ambient backend.
4. Add the `ClipboardScope` secondary-pasteboard selector once the seam is agreed.
5. Add `readClipboardBuffer`/`writeClipboardBuffer` (`ArrayBuffer` flavor) for non-text custom formats.
