---
package: '@flighthq/textinput'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source (4 files, 1195 lines)
  - tests (4 files, 1573 lines, 148 cases)
  - types surface (TextInputState, TextInputManager, TextInputEditingOptions, TextInputEditRecord, SelectableRichTextManager, TextInputController)
  - package.json
---

# textinput -- Review

## Verdict

**Solid -- 80/100.** The package delivers a coherent editable-text-field and read-only-selection
layer through 55 free functions operating on a `TextInputState` runtime slot. Core editing, caret
navigation (horizontal, vertical, word, line), undo/redo with merge-coalescing, input restrictions,
password masking, pointer dispatch, and focus management are all present and tested. The architecture
is clean: two distinct managers, side-effect-free imports, no renderer coupling, all types in
`@flighthq/types`, correct two-lane exports. What holds the score back is a cluster of known gaps
-- UTF-16 code-unit indexing, absent IME composition, no signals group, no guard module, ASCII-only
word boundaries, and an exported scroll function the manager path never calls -- that together
represent meaningful distance from AAA international-text correctness.

## Present capabilities

- **55 exported free functions** across 4 source files, with 148 test cases across 4 colocated test
  files. Every export has a matching alphabetized `describe` block.
- **Enable/disable seam.** `enableTextInput` allocates a `TextInputState` slot on a `RichText`'s
  runtime; `disableTextInput` detaches it. A `RichText` that never enables input carries no
  selection/caret/input code, preserving tree-shakability.
- **Caret and selection.** `moveTextInputCaret`, `setTextInputSelection`, `selectAllTextInput`,
  `selectWordAtTextInputIndex`, `selectLineAtTextInputIndex`. Selection begin/end queries clamp to
  text length. `getTextInputSelectionRectangles` delegates to `@flighthq/textlayout`.
- **Editing.** `insertTextInput`, `replaceTextInput`, `replaceSelectedTextInput`, `appendTextInput`,
  `deleteTextInputBackward`, `deleteTextInputForward`, `deleteTextInputWordBackward`,
  `deleteTextInputWordForward`. All go through `replaceTextInput`, which updates text format ranges,
  records history, resets `desiredCaretX`, and invalidates via `invalidateNodeLocalContent`.
- **Keyboard command dispatch.** `handleTextInputKeyboard` maps a `KeyboardEventData` to 20 distinct
  commands: arrows, Home/End (line-relative), Ctrl/Cmd+Home/End (document-level), word motion
  (Ctrl+Arrow or Alt+Arrow), word deletion (Ctrl+Backspace/Delete or Alt+Backspace/Delete),
  Backspace, Delete, Enter (multiline only), select-all, copy, cut, paste.
- **Vertical navigation.** `moveTextInputCaretUp`/`Down` use layout to resolve the target line,
  preserving `desiredCaretX` across consecutive vertical moves. Without layout, motion degenerates to
  text start/end.
- **Undo/redo.** Bounded history (`historyLimit`, default 100) with `mergeKind`-based coalescing.
  `undoTextInput`, `redoTextInput`, `canUndoTextInput`, `canRedoTextInput`, `clearTextInputHistory`.
  Redo tail is discarded on new edits.
- **Input restrictions.** `applyTextInputRestriction` enforces `restrict` grammar (accepted/declined
  ranges with `^` toggle and backslash escaping), `maxChars`, and single-line newline stripping.
- **Password masking.** `getTextInputDisplayText` substitutes a configurable `passwordCharacter`
  (default bullet).
- **Two managers.** `TextInputManager` (editable fields: pointer down/move/wheel, keyboard, text
  input, focus/blur) and `SelectableRichTextManager` (read-only: select-all, copy, pointer selection,
  wheel scroll). They share no base class and store selection state in different locations.
- **Input source connection.** `connectInputToTextInput` wires a `TextInputSource` (two signals:
  `onKeyDown`, `onTextInput`) to a manager, returning a disconnect function.
- **Scroll caret into view.** `scrollTextInputCaretIntoView` adjusts `scrollV` (line-based) and
  `scrollH` (pixel-based) to bring the caret into a given viewport. Implemented and exported, but not
  called by any manager function.
- **Package hygiene.** `sideEffects: false`, two-lane exports (`.` and `./contract`), dependencies
  limited to `node`, `signals`, `text`, `textlayout`, `types`. No renderer, clipboard, or platform
  dependency.

## Gaps

All verified against `packages/textinput/src/` and `packages/types/src/` as of this review.

1. **UTF-16 code-unit indexing.** `deleteTextInputBackward` uses `start - 1`
   (textInputEditing.ts:70), `deleteTextInputForward` uses `start + 1` (textInputEditing.ts:82),
   `moveTextInputCaret` steps by 1, and `getTextInputCharacterIndexAtPoint` returns code-unit
   offsets. All split surrogate pairs and break grapheme clusters. Charter acknowledges this as
   long-term scope.

2. **No IME/composition lifecycle.** Zero mentions of composition, marked text, or pre-edit ranges
   anywhere in the source. The charter names it long-term scope; no type or function signature
   exists.

3. **`scrollTextInputCaretIntoView` unwired from manager.** The function is exported
   (textInputEditing.ts:476) but never called from `dispatchTextInputKeyDown`,
   `dispatchTextInputPointerDown`, `dispatchTextInputPointerMove`, or `dispatchTextInput`. The
   manager path does not scroll the caret into view after editing or pointer drag. Status.md
   records this.

4. **O(n) string rebuild per edit.** `replaceTextInput` builds a new string with
   `slice(0, start) + value + slice(end)` (textInputEditing.ts:459) plus a full history snapshot.
   Adequate for typical text fields; would need a rope or gap buffer for document-scale editing.

5. **No signals group.** There is no `enableTextInputSignals`. `@flighthq/signals` is imported
   only for `connectSignal`/`disconnectSignal` on the input source. Callers cannot observe text
   change, caret movement, or selection change events without polling.

6. **No guard module.** There is no `enableTextInputGuards`. The common misuse --
   calling an editing function on a `RichText` that never called `enableTextInput` -- throws
   (`getInputState`, textInputEditing.ts:651-654), which is correct for programmer errors. But
   subtler misuses (dispatching to an unfocused manager, passing no layout to vertical motion)
   are silent.

7. **ASCII-only word boundaries.** `isWordChar` uses `/\w/` (textInputEditing.ts:891), which
   matches `[a-zA-Z0-9_]` only. Word motion and word deletion treat accented Latin, CJK, and
   other Unicode letters as non-word characters.

8. **Dual selection representations.** Editable fields store selection on `TextInputState.caretIndex`
   / `selectionIndex` (types TextInputState.ts:24-42). Read-only selectable fields store it on
   `RichTextRuntime.selectionBeginIndex` / `selectionEndIndex` (RichText.ts:54-55). The two
   models use different semantics (caret + anchor vs. begin + end) and different storage locations.
   Charter records the two-manager decision as intentional; the dual representation is its cost.

9. **Dead type in `@flighthq/types`.** `TextInputEditRecord` (TextInputEditRecord.ts) is
   field-identical to `TextInputHistoryEntry` (TextInputState.ts:10-18). `TextInputEditRecord` is
   exported from both `.` and `./contract` lanes but imported by no implementation package.
   `TextInputHistoryEntry` is the type actually used by `TextInputState.history`.

10. **No soft-keyboard or accessibility bridge.** `package.json` declares no dependency on
    `@flighthq/keyboard`. Focus/blur raises nothing on touch platforms, and no accessibility
    descriptor exists for assistive technology to mirror.

11. **`caretColor` is 24-bit RGB.** `TextInputState.caretColor` and `selectionColor` are documented
    as `0xRRGGBB` with `selectionAlpha` separate (TextInputState.ts:23, 39-41). This diverges from
    the SDK's packed RGBA `0xRRGGBBFF` convention; `selectionAlpha` is a float. The divergence is
    documented but not blessed by a direction decision.

## Charter contradictions

None found. The package matches its charter:

- Free-function editing over runtime slots -- verified; all 55 exports are free functions operating
  on `TextInputState` through `getInputState`.
- Selectable != editable -- verified; `SelectableRichTextManager` and `TextInputManager` are
  distinct types with separate creation, focus, dispatch, and selection storage.
- Grapheme-cluster awareness and IME listed as long-term -- both absent from source, matching the
  "known gap" posture.
- Home/End line-relative -- verified at textInputEditing.ts:351 and :367, with Ctrl/Cmd
  document-level variants at :248 and :250.
- Clipboard decoupled via `onCopy` callback -- verified at textInputEditing.ts:227 and :232.

## Contract & docs fit

- **Two-lane exports:** Correct. `index.ts` re-exports from `contract.ts`; both carry the same 55
  functions. No additional subpath exports.
- **sideEffects: false:** Correct. No top-level side effects in any source file. Module-level state
  is a single scratch rectangle (textInputEditing.ts:897-903) and one constant
  (`DESIRED_CARET_X_UNSET`), neither of which constitutes a side effect.
- **Types in @flighthq/types:** Correct. The package exports functions only; all interfaces
  (`TextInputState`, `TextInputOptions`, `TextInputHistoryEntry`, `TextInputManager`,
  `TextInputSource`, `SelectableRichTextManager`, `HandleTextInputKeyboardOptions`,
  `ReplaceTextInputOptions`) reside in `@flighthq/types`.
- **Naming convention:** All exported function names include the full type name (`TextInput` or
  `SelectableRichText`). No abbreviations.
- **import type separation:** Correct throughout. `import type { ... }` appears on its own lines,
  never mixed inline with value imports.
- **Test shape:** One test file per source file, colocated in `src/`, `describe` blocks
  alphabetized and mirror exported names. 55 describe blocks for 55 exports.
- **Diagnostics:** `getInputState` throws for the programmer error of calling editing functions
  without `enableTextInput` (correct per contract). No guard module exists for softer misuse
  warnings (noted in Gaps).

## Candidate open directions

1. **Wire `scrollTextInputCaretIntoView` into manager dispatch.** The function is implemented but
   unreachable from the normal `connectInputToTextInput` path. The manager needs the viewport
   dimensions (which it does not currently receive) to call it.

2. **Consolidate or remove `TextInputEditRecord`.** It duplicates `TextInputHistoryEntry`
   field-for-field and has no consumers. Either delete it or make `TextInputHistoryEntry` a type
   alias for it.

3. **Add `enableTextInputSignals`.** Text change, caret move, and selection change events would let
   callers react without polling. The charter's "input-signal wiring" phrasing suggests this is
   expected eventually.

4. **Unicode-aware word boundaries.** Replace `isWordChar`'s `/\w/` with `Intl.Segmenter` or a
   Unicode-category-aware classifier so word motion and word deletion work for non-ASCII scripts.

5. **Grapheme-cluster-aware cursor motion.** The indexing model must shift from UTF-16 code units to
   grapheme clusters for correct emoji, combining-character, and surrogate-pair handling. This is
   the charter's largest stated long-term goal.

6. **IME composition lifecycle.** Types and functions for marked text, candidate updates,
   composition cancellation, and composition-aware undo grouping.

7. **Direction decision on `caretColor`/`selectionColor` convention.** Decide whether these stay as
   24-bit RGB with separate alpha, or move to the SDK's packed RGBA convention.

8. **Guard module.** `enableTextInputGuards` would emit warnings through `@flighthq/log` for
   dispatching to an unfocused manager, editing without layout, and other soft misuses.
