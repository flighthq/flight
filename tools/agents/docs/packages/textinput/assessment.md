---
package: '@flighthq/textinput'
updated: 2026-07-02
basedOn: ./review.md
---

# textinput — Assessment

Verified against the live tree (4 source files, 4 test files, ~128 tests, 47 exports) and the direction session (2026-07-02). Six charter decisions blessed. Types are present in `@flighthq/types` (stale review was false alarm). Depth review: 74/100.

## Recommended

Sweep-safe: within-package fixes, no design fork.

1. **Fix Home/End to be line-relative.** Per charter Decision #5 — bug. Currently go to document start/end; standard behavior is line start/end. Ctrl+Home/Ctrl+End for document-level.

2. **Export the eight missing functions from the barrel.** `canRedoTextInput`, `canUndoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineEnd`, `moveTextInputCaretToLineStart`, `redoTextInput`, `undoTextInput`, `scrollTextInputCaretIntoView` — already `export function` in source but missing from `index.ts`. Run `npm run order:fix` after.

3. **Package Map description update.** Per charter Open direction #3.

## Backlog

- **IME/composition support.** Per charter Decision #3. In scope long-term, not immediate. Requires architecture design for composition events.
- **Grapheme-cluster awareness.** Per charter Decision #4. In scope long-term. Requires UTF-16→grapheme migration across caret/selection logic.
- **Clipboard write ownership.** Per charter Open direction #1. Cross-package question.
- **`historyLimit`/`mergeKind` defaults.** Per charter Open direction #2. Public API question.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: Home/End bug fix, barrel exports, Package Map
