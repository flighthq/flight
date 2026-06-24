---
package: '@flighthq/clipboard'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/clipboard.md
  - reviews/maturation/depth/clipboard.md
  - source
  - incoming/builder-67dc46d64 (changes.patch + head tree)
---

# Review: @flighthq/clipboard

## Verdict

**solid — 88/100.** This session lifted the package from a fixed-flavor convenience wrapper to a near-authoritative clipboard library: a generic MIME format seam, atomic multi-flavor write, batch read, file flavor, a completed `has*` set, and an `@flighthq/network`-shaped change-event capability all landed with full test coverage and an Electron backend that implements every new method. The status doc's claims check out against the diff one-for-one. It stops short of authoritative on three remaining axes — the typed-image-over-`Surface` flavor (still data-URL strings), secondary pasteboards / binary buffers / lazy rendering (the Gold tier), and the absent Rust crate — plus a handful of small contract-fit nits (`ClipboardBookmark` mis-homed, the new `ClipboardFormat` constants unused by the package's own code, a stale Package Map line and `package.json` description).

## Status-doc verification (AS-CLAIMED → verified)

Every claim in `status.md` was checked against `head/packages/clipboard/` and `changes.patch`:

- **55 tests**: confirmed — `grep -c "it("` = 55 across 32 `describe` blocks, one per export, each with a backend-roundtrip and a web-sentinel case (`66dc46d64:packages/clipboard/src/clipboard.test.ts`).
- **New `@flighthq/types` files**: `ClipboardFormat.ts`, `ClipboardWatch.ts`, `ClipboardWriteItem.ts` all present and exported from `types/src/index.ts` (lines 53–55). `ClipboardBackend` extended with the generic seam (`readFormat`/`writeFormat`/`hasFormat`/`getFormats`/`writeItems`/`readItems`), files (`readFiles`/`writeFiles`), and the change seam (`getChangeCount`/`subscribeClipboardChange`).
- **New exports**: all 13 named in the report exist in the realized `dist/clipboard.d.ts` and source.
- **Electron backend**: `electronClipboard.ts` implements all new methods (`readFormat`/`writeFormat` via buffer round-trip, `getFormats` via `availableFormats()`, `writeItems`/`readItems` as per-format dispatchers, `readFiles`/`writeFiles` as sentinels, `getChangeCount` → -1, `subscribeClipboardChange` → no-op). Verified by grep against `host-electron/src/electronClipboard.ts`.

No claim was found to overstate the work. The estimated 91/100 is within range; I land slightly lower (88) on the contract-fit nits and the still-open `Surface` image decision noted below.

## Present capabilities

Grounded in `66dc46d64:packages/clipboard/src/clipboard.ts`. Every function delegates to the active `ClipboardBackend` (lazy web default; `setClipboardBackend(null)` restores it):

- **Generic format seam**: `readClipboardFormat`, `writeClipboardFormat`, `hasClipboardFormat`, `getClipboardFormats`. This is the headline gap the prior depth review (78/100) called out, now closed — arbitrary MIME/UTType flavors are first-class.
- **Named-flavor convenience**: text (`read/write/hasClipboardText`), HTML (`read/write/hasClipboardHtml`), image-as-data-URL (`read/write/hasClipboardImage`), RTF (`read/write/hasClipboardRTF`), bookmark (`read/writeClipboardBookmark`, `hasClipboardBookmark`). The `has*` set is now symmetric with the flavors offered — the asymmetry the depth review flagged is resolved.
- **Atomic multi-flavor write + batch read**: `writeClipboard(items)` places all flavors in one `ClipboardItem` so a paste target picks its best representation; `readClipboard(formats)` reads many in one round-trip. The canonical "rich copy" (plain + styled together) is now possible.
- **File flavor**: `readClipboardFiles` / `writeClipboardFiles` (`[]` / `false` web sentinels).
- **Change-event capability**: `createClipboardWatch` / `attachClipboardWatch` / `detachClipboardWatch` / `disposeClipboardWatch` plus `getClipboardChangeCount`. Mirrors the `@flighthq/network` event-entity pattern: an entity of signals, attach/detach/dispose lifecycle, `WeakMap` subscription tracking, idempotent attach (`attachClipboardWatch` detaches first). The `dispose*`/`detach*` verb split is correct — `dispose*` releases-to-GC, there is no non-GC resource to `destroy*`.
- **Backend seam**: `getClipboardBackend` (always returns a backend), `setClipboardBackend`, `createWebClipboardBackend`. The web backend guards every path for missing API / non-secure context / jsdom and returns the documented sentinel rather than throwing — the expected-failure rule, honored throughout. `clearClipboard`.

The web backend is genuinely complete for what the platform allows: `navigator.clipboard.read()`/ `write()` with `ClipboardItem`, image blobs via `FileReader` → data URL and `fetch(dataUrl)` → `Blob`, and a speculative `clipboardchange`-event subscription that degrades to a no-op (honest: the event is not yet shipping in any browser, so web callers see the documented no-delivery sentinel).

## Gaps vs an authoritative clipboard library

These are what separate 88 from authoritative. None contradict the charter (it is a stub); all are missing-by-omission against the AAA/OpenFL standard and the package's own maturation roadmap:

- **Typed image flavor over `Surface`.** Images are still data-URL strings. For an SDK that owns `@flighthq/surface` / `ImageSource`, routing clipboard images through base64 rather than a pixel buffer is the remaining seam mismatch. The roadmap's Silver item (`readClipboardSurface(out)` / `writeClipboardSurface(surface)`) is explicitly deferred pending a design decision (type-only `Surface` from `@flighthq/types` vs a runtime `@flighthq/surface` dependency; bundle-size impact). This is the single largest depth gap and a genuine design fork — see Candidate open directions.
- **Secondary pasteboards.** No `ClipboardScope` (`'system' | 'selection' | 'find'`) — Linux PRIMARY selection, macOS find pasteboard. A fully authoritative library names them.
- **Binary / buffer flavors.** The generic seam is string-only. `readClipboardBuffer(format)` / `writeClipboardBuffer(format, buffer)` (Electron `readBuffer`/`writeBuffer` already exist on the backend) is the authoritative form for non-text custom flavors; the string seam is the convenience layer over it. Needs a canonical binary type decision (`ArrayBuffer` vs `Uint8Array`).
- **Lazy / promised rendering.** No `writeClipboardLazy(formats, provider)` (NSPasteboard promised types). A significant native-host contract; reasonably deferred until the seam settles.
- **`getClipboardCapabilities()` introspection.** No way to query which flavors/scopes the active backend supports — useful once scopes and buffers exist.
- **Atomicity on Electron.** `writeItems` on the Electron backend loops per-format rather than using `clipboard.write({ text, html, rtf })` — the web backend is truly atomic, Electron is not yet. A native-side polish item, not a seam gap.
- **No Rust crate.** `flighthq-clipboard` does not exist. The charter front matter declares `crate: flighthq-clipboard`, so this is a stated-but-unbuilt mirror, correctly deferred until the Silver contract stops moving.

## Charter contradictions

**None.** The charter (`packages/clipboard/charter.md`) is a stub — "What it is" is seeded from the prior depth review and North star / Boundaries / Decisions are all `TODO`. There is no stated principle, boundary, or decision for the code to violate. Per the rubric rule, every assumption I had to make to review (image model, scope set, Rust timing, dependency posture) is surfaced below as a candidate open direction rather than scored as a contradiction.

One forward-looking note for when the charter is authored: the package **gained an `@flighthq/signals` dependency** this session (for the watch entity), moving it from a `@flighthq/types`-only package to a two-dependency one. The codebase map calls signals "effectively always present," so this is defensible, but it is a real dependency-posture choice the charter should ratify — the maturation roadmap flagged it as a design item, and it is now decided-by-doing without a blessing.

## Contract & docs fit

**How the package lives up to the contract (mostly excellent):**

- **Naming**: every export carries the full unabbreviated `Clipboard` word, is globally self-identifying, uses `read*`/`write*`/`has*`/`get*`/`create*`/`attach*`/`detach*`/`dispose*` verbs correctly. Alphabetized within the file; tests mirror the order. `RTF` stays uppercased (acronym) while `Html` is title-cased — a defensible minor inconsistency carried from before.
- **Sentinels not throws**: honored everywhere (`''` / `false` / `[]` / `{}` / `null` / `-1` / no-op).
- **Single root export** (`index.ts` re-exports `./clipboard`), `"sideEffects": false`, lazy backend (no top-level side effects, no eager registration). Module-private state (`_backend`, `_watchSubscriptions`) sits at the bottom of the file per source style.
- **Types-first**: the seam (`ClipboardBackend`, `ClipboardBookmark`, `ClipboardWatch`, `ClipboardWriteItem`, `ClipboardFormat` constants) lives in `@flighthq/types` — correct header-layer placement. `import type` is on its own line.
- **Event-capability pattern**: the watch entity matches the documented command-vs-event split and the `@flighthq/network` precedent exactly.

**Candidate contract / admin-doc revisions (the user's gate, not mine):**

- **`ClipboardBookmark` is mis-homed.** It is defined inside `types/src/Clipboard.ts` alongside `ClipboardBackend`, but the types-layout convention is one concept per file with filename = type name. It should live in `types/src/ClipboardBookmark.ts`. (The contract's `crate`-null list and the one-concept-per-file rule both point this way.)
- **The new `ClipboardFormat` constants are unused by the package's own code.** `hasClipboardBookmark` hardcodes `'text/x-moz-url'`, `hasClipboardHtml` hardcodes `'text/html'`, `hasClipboardRTF` `'text/rtf'`, and `readClipboardHtml`/`readClipboardRTF` route through the backend's named methods with literal MIME strings rather than the shared constants. The constants exist for exactly this de-duplication; the package should consume `ClipboardFormatHtml` / `ClipboardFormatRtf` / `ClipboardFormatBookmark` instead of re-spelling the literals. Low-stakes, but it is the reason the constants were added.
- **Package Map line is stale.** `tools/agents/docs/index.md` still describes clipboard as "system clipboard read/write (text, HTML)." It now covers HTML, image, RTF, bookmark, files, the generic MIME seam, atomic write, and change events. The line should be widened.
- **`package.json` description is stale.** `"System clipboard read/write (text, HTML) over a swappable web/native backend"` understates the surface for the same reason.
- **No Rust crate despite `crate: flighthq-clipboard` in the charter front matter.** Not a defect (correctly deferred), but the front matter asserts a mirror that does not yet exist; reconcile when the crate lands or annotate the deferral.

## Candidate open directions

The charter is silent on all of these; each is an assumption I had to make to review, and each is a genuine fork the user should settle:

1. **Image model: data-URL string vs typed `Surface`.** Should clipboard images route through `@flighthq/surface` (caller-supplied `out: Surface`, type-only dependency from `@flighthq/types` to stay tree-shakable) or stay data-URL strings? And if a `Surface` path is added, are the data-URL functions deprecated or kept as a permanent web-convenience layer? This is the highest-value unanswered question — it is the difference between solid and authoritative for the image flavor, and it is a cross-package dependency decision the autonomy rule says to surface, not act on.
2. **Dependency posture.** Is the new `@flighthq/signals` dependency blessed, or should the watch entity live in a `clipboard`-neighbor so a read-only clipboard import stays dependency-light? Decide the package's tree-shake floor for callers who only want `readClipboardText`.
3. **Scope of the seam.** Are secondary pasteboards (`ClipboardScope`), binary buffers, and lazy rendering in scope for this package, or is "the system clipboard, all flavors" the intended boundary with scopes/promised-data parked? The Boundaries section is empty; this is where it gets drawn.
4. **Atomic-write contract for native hosts.** Should `ClipboardBackend.writeItems` require true atomicity (forcing Electron to add a `write({...})` path) or is per-format looping an acceptable backend-defined fallback? This affects the contract every future `host-*` backend implements.
5. **Binary canonical type.** If buffer flavors land, is `ArrayBuffer` or `Uint8Array` the SDK-canonical binary type for the clipboard (and ideally SDK-wide)?
6. **Rust-port timing.** Confirm the Silver seam is frozen enough to port Bronze+Silver to `flighthq-clipboard` (native default over `arboard`/`copypasta` behind the `native` feature), or hold until the `Surface` image decision lands to avoid re-porting a moving contract.
