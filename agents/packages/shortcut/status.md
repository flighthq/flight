---
package: '@flighthq/shortcut'
updated: 2026-08-08
by: principal
---

# shortcut — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/shortcut/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session. Most of what the old log carried
had already landed; this is what is genuinely still open.

- **`ShortcutSignals` carries only `onTrigger`** (`packages/types/src/ShortcutSignals.ts:6-8`). A
  settings or conflict-detection UI that wants to observe registration changes has nothing to listen
  to: there is no `onRegister` / `onUnregister`, and the firing side in `registerGlobalShortcut`
  (`shortcut.ts:247`) / `unregisterGlobalShortcut` (`:300`) / `unregisterAllGlobalShortcuts` (`:293`)
  cannot land until the type does.
- **The key vocabulary is split across two packages and two representations.** `ShortcutKeyName` is
  a string union (`packages/types/src/ShortcutKeyName.ts:10`); `@flighthq/input` addresses keys as a
  numeric `KeyCode` and never references `ShortcutKeyName`. One
  SDK, two spellings for the same physical key — aligning them (or declaring them deliberately
  distinct layers) is a cross-package ruling, not a rename.
- **`formatAcceleratorForDisplay` has no consumer.** `shortcut.ts:114` and
  `getAcceleratorModifierLabel` (`:142`) exist precisely so menu and tray can render a chord the way
  the OS spells it; neither package imports `@flighthq/shortcut` today, so `@flighthq/menu` prints
  the raw declared string. The open call is the dependency direction (menu/tray → shortcut) rather
  than the code.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: the two
  "design forks, deliberately not decided" (shifted-punctuation glyph keys, non-Electron physical
  keys) — `ShortcutKeyName.ts:1-9` already rules on both, choosing the physical-key vocabulary over
  the shifted glyph and bounding the set by what a native global-hotkey host can register. Also
  dropped the Rust-parity item (`flighthq-shortcut`): there is no `crates/` directory in this repo.
- **2026-07-30** — Three live defects fixed: a literal `+`/`-` key was unreachable (`Ctrl++`,
  `Ctrl+-` both returned `null`), `parseAccelerator` replaced the caller's `out.modifiers` array
  instead of refilling it, and `hasNativeShortcutBackend` was unanswerable until the installed and
  fallback backends were split into separate slots.
- **2026-07-30** — `ShortcutKeyName` landed in `@flighthq/types`; added
  `findAcceleratorConflict`, `disposeGlobalShortcutSignals`, Electron numpad short spellings, and the
  diagnostics pair `enableShortcutGuards` / `explainGlobalShortcutRegistration` (separate files so
  the pull query shakes free of `@flighthq/log`).
- **2026-06-25** — `getRegisteredGlobalShortcuts` now re-normalizes backend entries instead of
  casting them; `CommandOrControl` got its own sort ordinal; removed the unreachable `'Enter'`
  display entry.
- **2026-06-24** — Accelerator value layer built out: parse / normalize / validate / compare /
  display, plus enable-disable-without-unregister, suspend/resume, and the `onTrigger` signal group.
