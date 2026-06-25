---
package: '@flighthq/clipboard'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/clipboard (merge gate, integration b2824e3d8 → origin/main eb73c3d74)

The review rejects the delta for merge at **partial — 35/100**, not for a design flaw but because the integration tree dropped the `@flighthq/types` half of the change: `clipboard.ts` and its test depend on `ClipboardWatch`, `ClipboardWriteItem`, and ~10 new `ClipboardBackend` methods that do not exist in `@flighthq/types` in the head tree, so `tsc -b` cannot pass. The package-side design itself is sound and should survive the fix intact. The assessment below sorts what to do once the build is restored; the merge gate's must-fix directives live in `outgoing/integration/clipboard.md`.

The charter is still a **draft** (front matter `draft: true`; Decisions empty). Because of that, nothing requiring a scope, image-model, or dependency-posture decision can be Recommended; those are routed to the charter's Open directions at the bottom for the user to fold in — **not** edited into the charter here.

## Recommended

Sweep-safe: within `@flighthq/clipboard` (or a mechanical move/restore of a type the package owns), no open design decision, no breaking change to the intended public surface. These presuppose the merge blocker is fixed (the types restored) — they are the follow-on tidy, not the gate.

- **Restore the `@flighthq/types` clipboard header to match the package.** Re-add `packages/types/src/ClipboardWatch.ts`, `ClipboardWriteItem.ts`, and the `ClipboardBackend` extension (`readFormat`/`writeFormat`/`hasFormat`/`getFormats`/`readItems`/`writeItems`/ `readFiles`/`writeFiles`/`getChangeCount`/`subscribeClipboardChange`) so the integration tree type-checks. This is the merge blocker; it is in this list only as the within-scope work item — see the dispatch brief for the imperative form. — review.md (The merge blocker)

- **Fix the `subscribeClipboardChange` feature-detect in the web backend.** Replace the double-cast dead second clause (`(window as unknown as Record<string, unknown>)['clipboardchange']`, `clipboard.ts:216-219`) with a single honest `'onclipboardchange' in window` test. Within-package, no contract change. — review.md (axis 7)

- **Consume the `ClipboardFormat` constants in the package's own code.** Once restored, route the hardcoded `'text/x-moz-url'` / `'text/html'` / `'text/rtf'` literals in `hasClipboardBookmark` / `hasClipboardHtml` / `hasClipboardRTF` (and the `read*`/`write*` flavor paths) through the shared constants the constants were added for. Pure within-package de-duplication. — review.md (admin docs)

- **Widen the Package Map line.** `tools/agents/docs/index.md` still reads "system clipboard read/write (text, HTML)"; the surface now covers HTML, image, RTF, bookmark, files, the generic MIME seam, atomic write, and change events. One-line doc edit. — review.md (admin docs)

- **Widen the `package.json` description.** `"System clipboard read/write (text, HTML) over a swappable web/native backend"` (`package.json:36`) understates the surface for the same reason. Within-package doc edit. — review.md (admin docs)

## Backlog

Parked: each needs a design decision the draft charter has not made, crosses a package boundary, or is larger native-host work better sequenced after the seam freezes.

- **Typed image flavor over `Surface`** (`readClipboardSurface(out)` / `writeClipboardSurface`). Parked — the single largest depth gap and a genuine design fork: type-only `Surface` from `@flighthq/types` vs a runtime `@flighthq/surface` dependency, bundle-size impact, and whether the data-URL functions are deprecated or kept as a permanent web-convenience layer. Cross-package, not autonomous; routed to Open directions. — charter Open directions 1

- **Secondary pasteboards (`ClipboardScope = 'system' | 'selection' | 'find'`).** Parked — threading a `scope` parameter through the whole read/write/has/format/watch surface is an in/out-of-scope Boundaries decision the draft charter has not settled. Routed to Open directions. — charter Open directions 3

- **Binary / buffer flavors** (`readClipboardBuffer` / `writeClipboardBuffer`). Parked — needs a canonical binary-type decision (`ArrayBuffer` vs `Uint8Array`, ideally SDK-wide) before the seam is cut. Routed to Open directions. — charter Open directions 5

- **Lazy / promised rendering** (`writeClipboardLazy(formats, provider)`). Parked — a significant native-host contract, reasonably deferred until the buffer/scope seam settles. — charter Open directions 3

- **`getClipboardCapabilities()` introspection.** Parked — only meaningful once scopes and buffers exist; depends on the two forks above. — charter Open directions 7

- **Atomic `writeItems` on the Electron backend.** Parked — cross-package: the fix lives in `@flighthq/host-electron` (`clipboard.write({ text, html, rtf })` rather than a per-format loop), and whether true atomicity is _required_ of every `host-*` backend is itself a contract decision. Routed to Open directions. — charter Open directions 4

- **Rust crate `flighthq-clipboard`.** Parked — cross-package new crate; the charter front matter declares `crate: flighthq-clipboard` but the mirror does not exist. Correctly deferred until the seam (especially the `Surface` image decision) stops moving. — charter Open directions 6

- **Ratify the `@flighthq/signals` dependency.** Parked — the watch entity moved clipboard from a `@flighthq/types`-only package to a two-dependency one. Defensible ("signals effectively always present") but currently decided-by-doing without a blessing; whether a read-only `readClipboardText` import should stay dependency-light is a charter call. Routed to Open directions. — charter Open directions 2

## Approved

_None. Approval is the user's verbal gate; nothing is approved until the user says so._

## Notes for the charter's Open directions (do not edit the charter here)

The draft charter already enumerates these forks; this merge review reaffirms them and adds the build-integrity observation. Each is a decision the user should fold into `charter.md › Open directions`:

1. **Image model** — data-URL string vs typed `Surface` (`out`-param, type-only `@flighthq/types` dependency); and whether data-URL functions are deprecated or kept as a web-convenience layer.
2. **Dependency posture** — bless the `@flighthq/signals` dependency, or rehome the watch entity so a read-only clipboard import stays dependency-light; set the tree-shake floor.
3. **Seam scope** — are secondary pasteboards (`ClipboardScope`), binary buffers, and lazy rendering in scope, or is "the system clipboard, all flavors" the intended boundary?
4. **Atomic-write contract** — must `ClipboardBackend.writeItems` be truly atomic (forcing Electron to add a `write({...})` path), or is per-format looping an acceptable backend-defined fallback?
5. **Binary canonical type** — `ArrayBuffer` vs `Uint8Array` as the SDK-canonical (ideally SDK-wide) clipboard binary type, if buffer flavors land.
6. **Rust-port timing** — confirm the seam is frozen enough to port to `flighthq-clipboard`, or hold until the `Surface` image decision lands.
7. **Merge-integrity guard** — this delta merged the package + its status doc but dropped the `@flighthq/types` half, leaving an unbuildable tree. Worth a charter/process note that a types-first feature must merge its `@flighthq/types` commits atomically with the implementing package.
