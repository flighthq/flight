---
package: '@flighthq/clipboard'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/clipboard

The review lands the package at **solid — 88/100**: the generic MIME format seam, atomic multi-flavor write, batch read, file flavor, the completed `has*` set, and the change-event watch capability all shipped this session with full test coverage and an Electron backend. Bronze and most of Silver from the maturation roadmap are done. What remains splits cleanly into a small set of sweep-safe within-package cleanups (below) and a larger backlog gated on design forks the stub charter has not yet settled.

The charter is still a stub — North star, Boundaries, and Decisions are all `TODO`. Because of that, nothing requiring a scope or dependency-posture decision can be Recommended; those are routed to the charter's Open directions (listed at the bottom for the user to fold in, **not** edited into the charter here).

## Recommended

Sweep-safe: within `@flighthq/clipboard` (or a mechanical move of a type the package owns), no open design decision, no breaking change to the public surface.

- **Consume the `ClipboardFormat` constants in the package's own code.** `hasClipboardBookmark` hardcodes `'text/x-moz-url'`, `hasClipboardHtml` `'text/html'`, `hasClipboardRTF` `'text/rtf'`, and the `read*Html`/`read*RTF` paths re-spell literal MIME strings. The constants (`ClipboardFormatHtml` / `ClipboardFormatRtf` / `ClipboardFormatBookmark`) were added this session for exactly this de-duplication and are currently unused by the package. Route the literals through the shared constants. Pure within-package, low-stakes. — review.md (Contract & docs fit)

- **Move `ClipboardBookmark` to its own file in `@flighthq/types`.** It is defined inside `types/src/Clipboard.ts` alongside `ClipboardBackend`, violating the one-concept-per-file / filename = type-name convention. Relocate to `types/src/ClipboardBookmark.ts` and re-export. Mechanical move of a type the clipboard package owns; no behavior change, no design decision. — review.md (Contract & docs fit)

- **Widen the Package Map line.** `tools/agents/docs/index.md` still reads "system clipboard read/write (text, HTML)." It now covers HTML, image, RTF, bookmark, files, the generic MIME seam, atomic write, and change events. Update the one-line description to match. — review.md (Contract & docs fit)

- **Widen the `package.json` description.** `"System clipboard read/write (text, HTML) over a swappable web/native backend"` understates the surface for the same reason. Within-package doc edit. — review.md (Contract & docs fit)

- **Harden / de-duplicate `createWebClipboardBackend`.** Fold the now-many `getWebClipboard()` + try/catch blocks behind one internal helper, and query the Permissions API (`navigator.permissions.query({ name: 'clipboard-read' })`) in probe paths so `has*`/enumeration do not trigger throwing permission prompts. Within-package refactor; the sentinel contract is unchanged. — reviews/maturation/depth/clipboard.md (Silver: `createWebClipboardBackend` hardening)

## Backlog

Parked: each needs a design decision the stub charter has not made, crosses a package boundary, or is larger native-host work better sequenced after the Silver seam freezes.

- **Typed image flavor over `Surface`** (`readClipboardSurface(out)` / `writeClipboardSurface`). Parked — this is the single largest depth gap **and a genuine design fork**: type-only `Surface` from `@flighthq/types` vs a runtime `@flighthq/surface` dependency, the bundle-size impact, and whether the data-URL functions are deprecated or kept as a permanent web-convenience layer. Routed to Open directions; cross-package, not autonomous. — review.md (Gaps; Candidate open directions 1)

- **Secondary pasteboards (`ClipboardScope = 'system' | 'selection' | 'find'`).** Parked — threading a `scope` parameter through the entire read/write/has/format/watch surface is in/out-of-scope a Boundaries decision the charter has not made. Routed to Open directions. — reviews/maturation/depth/clipboard.md (Gold); review.md (Candidate open directions 3)

- **Binary / buffer flavors** (`readClipboardBuffer` / `writeClipboardBuffer`). Parked — needs a canonical binary-type decision (`ArrayBuffer` vs `Uint8Array`, ideally SDK-wide) before the seam is cut; the Electron backend already exposes `readBuffer`/`writeBuffer` to build on. Routed to Open directions. — review.md (Gaps; Candidate open directions 5)

- **Lazy / promised rendering** (`writeClipboardLazy(formats, provider)`, NSPasteboard promised types). Parked — a significant native-host contract, reasonably deferred until the buffer/scope seam settles. — reviews/maturation/depth/clipboard.md (Gold)

- **`getClipboardCapabilities()` introspection.** Parked — only meaningful once scopes and buffers exist; depends on the two forks above. — review.md (Gaps)

- **Atomic `writeItems` on the Electron backend.** Parked — cross-package: the fix lives in `@flighthq/host-electron` (`clipboard.write({ text, html, rtf })` instead of the current per-format loop), and whether true atomicity is _required_ of every `host-*` backend is itself a contract decision routed to Open directions. The web backend is already atomic. — review.md (Gaps; Candidate open directions 4)

- **Rust crate `flighthq-clipboard`.** Parked — cross-package new crate; the charter front matter declares `crate: flighthq-clipboard` but the mirror does not exist. Correctly deferred until the Silver seam (especially the `Surface` image decision) stops moving, to avoid re-porting a moving contract. — review.md (Gaps; Candidate open directions 6)

- **Ratify the `@flighthq/signals` dependency.** Parked — the watch entity moved clipboard from a `@flighthq/types`-only package to a two-dependency one. Defensible ("signals effectively always present") but it is a dependency-posture choice that is currently decided-by-doing without a blessing; the question of whether a read-only `readClipboardText` import should stay dependency-light belongs in the charter. Routed to Open directions. — review.md (Charter contradictions; Candidate open directions 2)

## Approved

_None yet — approval is the user's verbal gate._

## Notes for the charter's Open directions (do not edit the charter here)

The review surfaced these forks; each is an assumption a reviewer had to make and a decision the user should fold into `charter.md › Open directions`:

1. **Image model** — data-URL string vs typed `Surface` (`out`-param, type-only `@flighthq/types` dependency); and whether data-URL functions are deprecated or kept as a web-convenience layer.
2. **Dependency posture** — bless the `@flighthq/signals` dependency, or rehome the watch entity so a read-only clipboard import stays dependency-light; set the tree-shake floor.
3. **Seam scope** — are secondary pasteboards (`ClipboardScope`), binary buffers, and lazy rendering in scope, or is "the system clipboard, all flavors" the intended boundary?
4. **Atomic-write contract** — must `ClipboardBackend.writeItems` be truly atomic (forcing Electron to add a `write({...})` path), or is per-format looping an acceptable backend-defined fallback?
5. **Binary canonical type** — `ArrayBuffer` vs `Uint8Array` as the SDK-canonical clipboard (ideally SDK-wide) binary type, if buffer flavors land.
6. **Rust-port timing** — confirm the Silver seam is frozen enough to port Bronze+Silver to `flighthq-clipboard`, or hold until the `Surface` image decision lands.
