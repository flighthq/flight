---
package: '@flighthq/shortcut'
updated: 2026-07-30
basedOn: ./review.md
---

# shortcut — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. **Decide the shifted-punctuation key vocabulary** — Electron's accelerator syntax accepts shifted
   glyphs (`~ ! @ # $ % ^ & * ( ) _ { } | : " < > ?`) as key codes; `ShortcutKeyName` carries only the
   unshifted physical-key names (`Backquote`, `BracketLeft`, …). Accepting `Ctrl+~` means either
   mapping it to `Backquote` (losing the implied Shift) or admitting glyph-identity key names beside
   the physical ones. This is a design fork about what a key name *is*, so it wants a ruling before
   anyone adds aliases.
2. **Decide whether non-Electron physical keys belong in the vocabulary** — `Pause`, `ContextMenu`,
   `Clear`, `Help` are real keys with no `ShortcutKeyName`. They are deliberately absent: Electron
   cannot register them, so admitting them would let a caller write a chord that parses cleanly and
   then silently fails on every backend. Revisit if a non-Electron host lands.

## Approved

1. **Remove dead `'Enter'` display entry** [2026-07-02 · blanket "platform integration suite sweep"]
   — done; the map has no `'Enter'` entry.

## Backlog

- Rust parity for the deterministic parse/normalize/format/validate value core.
