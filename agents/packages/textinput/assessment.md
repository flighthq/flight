---
package: '@flighthq/textinput'
updated: 2026-07-30
basedOn: ./review.md
---

# textinput — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No open sweep-safe items. The prior three-item list was stale against the live tree: the editing command,
barrel exports, and Package Map description had already landed. The manager-level layout omission found
during verification is fixed and regression-tested.

## Approved

1. **[2026-07-30 · completed] Make Home/End line-relative.** Command semantics and Ctrl/Cmd document
   variants landed in `e2b458de0`; `3a718da05` completed the normal manager path by passing the focused
   target's runtime layout into keyboard handling.
2. **[2026-07-30 · completed] Export the eight missing functions from the barrel.** The live root and
   `/contract` barrels already expose all eight; current public promotion is recorded in `68d3af93e` and
   `3def2fddd`.
3. **[2026-07-30 · completed] Update the Package Map description.** The live map already documents the
   complete editing, navigation, history, restriction, scrolling, manager, and signal-wiring surface.

## Backlog

- Grapheme-cluster-aware indexing across caret movement, deletion, selection, restrictions, and history.
- IME composition lifecycle and composition-aware undo grouping.
- Explicit platform key-policy support for native macOS Command/Option navigation conventions.
- Direction on system clipboard ownership and on public `historyLimit`/`mergeKind` defaults.
- Revisit the two selection-state representations if shared behavior begins to diverge despite the
  separate-manager decision.
