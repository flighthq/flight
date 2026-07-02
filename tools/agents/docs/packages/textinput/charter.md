---
package: '@flighthq/textinput'
crate: flighthq-textinput
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textinput — Charter

## What it is

`@flighthq/textinput` is **editable-text-field behavior** — caret/selection model, text insertion/deletion/replacement, keyboard command dispatch, input restrictions (`restrict` grammar + `maxChars`), password masking, word/line selection, word-granular and vertical caret motion, undo/redo with merge-coalescing, caret-scroll-into-view, and two managers: an editable `TextInputManager` and a read-only `SelectableRichTextManager`. All logic is free functions operating on a `TextInputState` runtime slot attached via `enableTextInput`. 47 exports, 4 source files, ~128 tests. Dependencies: `node`, `signals`, `text`, `textlayout`, `types`.

Selectable text is not input — the two managers serve genuinely different concerns (selection-only vs full editing). They stay separate.

## North star

1. **Free-function editing over runtime slots.** All editing behavior is free functions over `TextInputState`. No class hierarchy, no hidden mutation.
2. **Selectable != editable.** Two managers for two jobs: `SelectableRichTextManager` (read-only selection) and `TextInputManager` (full editing). They share low-level selection primitives but are not the same concern.
3. **Correct Unicode handling (long-term).** Grapheme-cluster-aware operations and IME/composition support are in scope. The current UTF-16-code-unit model is a known gap.

## Boundaries

**In scope:**

- Caret positioning and selection (single-range).
- Text insertion, deletion, replacement.
- Keyboard command dispatch (cut/copy/paste/select-all/undo/redo/arrow keys).
- Input restrictions (`restrict` grammar, `maxChars`).
- Password masking.
- Word/line selection, word-granular and vertical caret motion.
- Undo/redo with merge-coalescing.
- Caret-scroll-into-view.
- Focus and dispatch management (editable + read-only selectable).
- IME/composition support (long-term).
- Grapheme-cluster awareness (long-term).

**Non-goals:**

- Rendering text — `@flighthq/text` display objects + renderers.
- Layout/glyph positioning — `@flighthq/textlayout`.
- System clipboard implementation — `@flighthq/clipboard`.
- Raw input normalization — `@flighthq/input`.

## Decisions

- **[2026-07-02] ~~Missing types~~ — false alarm.** Types were already present and correctly defined in `@flighthq/types`. The depth review was based on stale state.

- **[2026-07-02] Two managers, not one.** Selectable text != input. `SelectableRichTextManager` and `TextInputManager` serve different concerns and stay separate. They may share low-level selection primitives but are not unified into one manager with a `readOnly` flag.

  **Why:** Selection-only text (labels, rich text display) and full editing (text fields) have different lifecycle, focus, and keyboard handling needs. Forcing them into one manager adds complexity for a false unity.

- **[2026-07-02] IME/composition in scope long-term.** Required for CJK input. Not immediate priority, but the architecture should not preclude it.

  **Why:** A text input system without IME is incomplete for a non-trivial share of the world's users.

- **[2026-07-02] Grapheme-cluster awareness in scope long-term.** Currently operates on UTF-16 code units — emoji and composed characters break. Must be fixed.

  **Why:** Correct text editing requires grapheme-cluster boundaries, not code-unit boundaries.

- **[2026-07-02] Home/End should be line-relative — bug fix.** Currently go to document start/end. Standard behavior is line-relative (go to start/end of current line). This is a bug.

  **Why:** Every standard text editor uses line-relative Home/End. Document-level navigation is Ctrl+Home/Ctrl+End.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Clipboard write ownership.** After `navigator.clipboard` removal, copy delegates to an `onCopy` callback. Who owns the actual system-clipboard write — the host, `@flighthq/clipboard`, or the app?

2. **`historyLimit`/`mergeKind` defaults as public API.** The 100-entry default and `mergeKind` string convention are reasonable but unblessed. Worth a decision before they ossify.

3. **Package Map update.**
