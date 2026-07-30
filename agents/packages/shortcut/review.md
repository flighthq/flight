---
package: '@flighthq/shortcut'
status: solid
score: 80
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - host-electron
  - host-tauri
---

# shortcut — Review

## Verdict

**Solid — 80/100.** The live package is a complete accelerator value library and swappable
global-hotkey seam, not the unbuildable intermediate delta described by the old review. Its 23 public
functions plus three contract-only backend functions cover parsing, normalization, diagnostics,
display, equality, registration, enumeration, conflict queries, enable/suspend commands, and an
opt-in trigger signal. Shared types are present, imports are side-effect-free, and all 98 focused tests
pass. Remaining depth lies at host boundaries: the Electron and Tauri adapters register shortcuts but
cannot realize the enable/suspend commands, and Tauri's asynchronous plugin is projected through a
synchronous optimistic backend contract.

## What is solid

- Accelerator parsing accepts documented modifier and key aliases, returns `null` on its common
  failure path, and offers structured `AcceleratorParseError` diagnostics when callers need detail.
- Normalization has a deterministic modifier order, including the pathological
  `Control`/`CommandOrControl` combination. Backend enumeration re-normalizes untrusted strings and
  drops invalid entries rather than asserting them into the `Accelerator` type.
- Display helpers produce platform-specific modifier labels and canonical key glyphs. `Enter`
  normalizes to `Return`, and only the reachable `Return → ↵` display entry remains.
- The `ShortcutBackend`, accelerator value types, event payload, and signal group live in
  `@flighthq/types`; the package consumes contract lanes and keeps its backend setters out of the
  ordinary public lane.
- Web behavior uses honest unsupported sentinels. The Electron and Tauri adapters supply native
  registration, enumeration, unregistration, and event translation without importing their host SDKs
  directly into this package.
- The signal group is opt-in and stable, package import has no host side effects, `sideEffects` is
  false, all exported functions have colocated tests, and the focused structural gate is green.

## Remaining depth

- **Native enable/suspend semantics.** `disableGlobalShortcut`, `enableGlobalShortcut`,
  `suspendAllGlobalShortcuts`, and `resumeAllGlobalShortcuts` are part of the public surface, but both
  shipped native adapters return `false` or no-op for the underlying toggle calls. Either adapters must
  emulate toggling through retained handlers and unregister/re-register, or the contract must expose
  capability truth so callers do not mistake registration support for toggle support.
- **Tauri completion semantics.** `ShortcutBackend` is synchronous while Tauri registration is
  asynchronous. The adapter optimistically returns `true` and repairs only its local mirror after a
  rejection, so the initiating caller cannot observe native registration failure. This needs a
  deliberate async seam, queued result signal, or explicitly blessed optimistic contract.
- **Key vocabulary ownership.** Accepted key names are an internal map; the charter previously claimed
  a public `ShortcutKeyName` type that is not in the live type package. The shared vocabulary and
  dependency direction among shortcut, input, menu, and tray remain unresolved.
- **Registration observability.** `onTrigger` covers activations, but registration/unregistration
  changes have no signal. Add such observation only when a conflict-management consumer needs it.

## Boundary conclusion

The package's value core and registration seam are mature enough for ordinary use, and the completed
dead-entry cleanup needs no further source change. The next valuable work is host-contract design, not
more parser surface or local polish; multi-key sequences and in-app binding maps remain correctly owned
by `@flighthq/input`.
