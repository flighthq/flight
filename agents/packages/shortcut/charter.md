---
package: '@flighthq/shortcut'
crate: flighthq-shortcut
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shortcut — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Global OS hotkey (system-wide accelerator) cell — the richest standalone API in the UI/shell group (26 exports, 98 tests). Beyond registration over a `ShortcutBackend`, the package owns the accelerator domain: parsing and normalization of accelerator strings (alias-insensitive: Ctrl/Control, Cmd/Command/Meta, Option/Alt, Win/Super), platform-aware display formatting (macOS `⌘⇧K` vs `Ctrl+Shift+K`), chord equality, validation, enumeration, and conflict detection. The accelerator types (`Accelerator`, `ParsedAccelerator`, `ShortcutModifier`, `ShortcutKeyName`, `ShortcutEvent`, `AcceleratorParseError`) live in `@flighthq/types`. It registers global OS hotkeys, not in-app key-binding maps or multi-key sequence chords — those belong to `@flighthq/input`.

## Decisions

- **[2026-07-02] Remove dead `'Enter'` display entry.** The `_keyDisplayNames` map has an `'Enter' -> '↵'` entry that is unreachable because `enter` aliases to `'Return'` during normalization. Remove it.

## Open directions

1. **Who owns the accelerator display vocabulary across `shortcut` / `menu` / `tray` / `input`?** Do `menu` / `tray` depend on `shortcut` (dependency direction menu/tray -> shortcut), or does the vocabulary live in `@flighthq/types` with all three depending only on the header?
2. **`CommandOrControl` in the canonical form.** Should `normalizeAccelerator` resolve `CommandOrControl` to the concrete platform modifier (making the normalized string platform-specific), or preserve it (keeping the chord portable)?
3. **Rust port as a value-typed mixable leaf.** The deterministic value core (parse/normalize/format/validate) is exactly the value-typed leaf the Rust map flags as a best first conformance target — no GPU, headlessly fingerprintable.
