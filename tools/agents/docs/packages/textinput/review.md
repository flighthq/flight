---
package: '@flighthq/textinput'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/textinput/src
  - head/packages/types/src
  - changes.patch (packages/textinput/ slice)
  - charter.md
---

# textinput — Review

Merge-gate review of the **delta** only: `incoming/integration-b2824e3d8/head/packages/textinput/` vs the approved baseline `incoming/integration-b2824e3d8/base/packages/textinput/` (= `origin/main` `eb73c3d74`). Findings cite `b2824e3d8:<path>`. The baseline is the blessed floor and is not under review. This supersedes the prior `67dc46d64` review against a different snapshot — its central diagnosis no longer holds (see "Honesty note" below).

## What the delta tries to do

The incoming change is a large, well-scoped feature expansion of editable-field behavior, all natural AAA additions to the charter's stated scope:

- **Word motion + word delete** — `moveTextInputCaretByWord`, `deleteTextInputWordBackward/Forward`, with `findWordStartBefore`/`findWordEndAfter` reusing the existing `isWordChar` boundary; wired into `getKeyboardCommand` for Ctrl+Arrow (Win/Linux), Alt+Arrow (macOS), and Ctrl/Alt+Backspace/Delete.
- **Vertical navigation** — `moveTextInputCaretUp`/`Down` with a preserved desired-x column (`desiredCaretX`), plus `moveTextInputCaretToLineStart`/`ToLineEnd`, over layout-group scans.
- **Undo/redo** — `undoTextInput`/`redoTextInput`/`canUndoTextInput`/`canRedoTextInput`/`clearTextInputHistory`, a `recordTextInputEdit` ring with `historyLimit` and `mergeKind` coalescing, threaded into `replaceTextInput`.
- **Scroll-into-view** — `scrollTextInputCaretIntoView` over `setRichTextScrollH/V`.
- **Clipboard de-coupling** — removes the hidden `navigator.clipboard?.writeText(...)` side effect from `selectableRichTextManager.ts` and `textInputManager.ts`, replacing it with an explicit `onCopy?` callback threaded through the dispatchers. A genuinely good move toward the "no magic side effect" rule.

As a feature design this is the right shape and the right vocabulary. The problem is not the design — it is that **the change is not internally complete and does not build.**

## Merge-gate verdict: REJECT — the delta does not compile

Three independent, grounded structural breaks. Any one blocks merge; together they show the branch was captured mid-flight.

### 1. The implementation grew without its header — the types-first contract is violated, and the source does not typecheck

The new source reads and writes `TextInputState` fields, `*Options` fields, and a type that **do not exist** in `@flighthq/types` in this snapshot. The textinput-owned types are byte-identical between base and head (`b2824e3d8:packages/types/src/TextInputState.ts`, `TextInputEditingOptions.ts` carry **no delta**), while the source depends on fields the header never gained:

- `b2824e3d8:packages/textinput/src/textInput.ts:53-69` returns a `TextInputState` literal with `caretColor`, `caretWidth`, `desiredCaretX`, `history`, `historyIndex`, `historyLimit`:
  ```ts
  caretColor: options?.caretColor ?? 0x000000,
  ...
  history: [],
  historyIndex: -1,
  historyLimit: options?.historyLimit !== undefined ? Math.max(0, options.historyLimit) : 100,
  ```
  but `TextInputState` in `@flighthq/types` has only `{ alwaysShowSelection, caretIndex, displayAsPassword, focused, passwordCharacter, restrict, selectionAlpha, selectionColor, selectionIndex }`. The excess-property literal is a TS error, and every later `state.history` / `state.historyIndex` / `state.historyLimit` / `state.desiredCaretX` read (`textInputEditing.ts:46-47, 59-60, 328, 410-412, 459-460, 622, 754-781`) is a property-does-not-exist error.
- `TextInputOptions` lacks `caretColor`/`caretWidth`/`historyLimit`, which `applyTextInputOptions` reads (`b2824e3d8:packages/textinput/src/textInput.ts:39-42`).
- `ReplaceTextInputOptions` has only `{ applyInputRules? }`, but `replaceTextInput` reads `options?.mergeKind` and `options?.skipHistory` (`b2824e3d8:packages/textinput/src/textInputEditing.ts:459-460`).
- `HandleTextInputKeyboardOptions` has only `{ clipboardText?, onCopy? }`, but `handleTextInputKeyboard` reads `options?.layout` for `'up'`/`'down'` (`b2824e3d8:packages/textinput/src/textInputEditing.ts:248, 273`).
- `b2824e3d8:packages/textinput/src/textInputManager.ts:3,23` imports and uses `InputTextData`, which **does not exist** in `@flighthq/types` (the `onTextInput` payload is still `TextSelectionRange` per `InputSignals.ts:21`), so `connectInputToTextInput`'s `onTextInput = (data: Readonly<InputTextData>) => …` fails twice: undefined type, and a payload mismatch against the `Signal<(TextSelectionRange) => void>` it connects to.
- `recordTextInputEdit` pushes a history record (`textBefore`, `textAfter`, `caretIndex{Before,After}`, `selectionIndex{Before,After}`, `mergeKind`) with no `TextInputEditRecord` type anywhere; `state.history` has no element type to satisfy.

This inverts the contract rule "define its types in `@flighthq/types` first, then implement against them." The header is the design surface and it was never extended.

### 2. The test fixtures don't typecheck either

`b2824e3d8:packages/textinput/src/selectableRichTextManager.test.ts:30` and `textInputManager.test.ts:47` add `timeStamp: 0` to `InputKeyboardData` fixtures, but `InputKeyboardData` has no `timeStamp` field — an excess-property error (`tsc -b` typechecks `src/*.test.ts`).

### 3. Eight implemented, tested public functions are unreachable from the barrel

`textInputEditing.ts` exports `canRedoTextInput`, `canUndoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineEnd`, `moveTextInputCaretToLineStart`, `redoTextInput`, `undoTextInput`, and `scrollTextInputCaretIntoView` as `export function`, but the named barrel `b2824e3d8:packages/textinput/src/index.ts:12-39` re-exports none of them (it added only `deleteTextInputWord*` and `moveTextInputCaretByWord/Down/Up`). They have colocated `describe` blocks in the test diff, so `npm run exports:check` and the single-root-`.`-entry contract both fail: implemented-and-tested surface with no public reach. Root cause: textinput's barrel is a hand-maintained named-export list (unlike the `export *` barrels elsewhere), so new exports must be added by hand and were not.

## Honesty note on the incoming docs

The branch ships `b2824e3d8:tools/agents/docs/packages/textinput/review.md`/`assessment.md` asserting the build is broken by "five undefined helpers … `recordTextInputEdit`, `applyHistoryRecord`, `getCaretLineIndex`, `getLineStartIndex`/`getLineEndIndex`" and that "`@flighthq/types` carries the full header for all of it." Both claims are **stale/false against this snapshot**: all five helpers are defined (`b2824e3d8:packages/textinput/src/textInputEditing.ts:612-624, 633-637, 687-712, 745-783`), and the header is exactly what is missing (#1). Those docs are superseded by this review.

## What is sound (so the fix is finishing, not redesigning)

- **Composition / bedrock** (pass): functions are small and single-purpose; word/line/vertical/undo are separate exports, not config branches. Vertical nav reuses one `scratchRect` to avoid per-keystroke allocation (`b2824e3d8:packages/textinput/src/textInputEditing.ts:886-892`) — correct allocation discipline.
- **Naming** (pass): `moveTextInputCaretByWord`, `deleteTextInputWordBackward`, `scrollTextInputCaretIntoView`, `canUndoTextInput` are full, unabbreviated, self-identifying, with correct `move`/`delete`/`can`/`scroll` verbs.
- **Tree-shaking** (pass, modulo #3): `package.json` keeps `"sideEffects": false`; no top-level side effects; the `navigator.clipboard` removal makes the package cleaner, not heavier.
- **Registry vs union** (n/a): `getKeyboardCommand`'s `KeyboardCommand` union grows but stays a tight internal keymap inside one closed function — acceptable; no user-extension story is implied.
- **Contract hygiene** (mixed): `getTextInputCaretRectangle` is alias-safe; `getInputState` correctly throws on "input not enabled" as API misuse (`b2824e3d8:packages/textinput/src/textInputEditing.ts:645-648`) rather than returning a sentinel — right call. The one violation is types-first (#1).
- **Cross-package wiring** (verified present): `TextLayoutResult.numLines/lineHeights`, `RichText.scrollH/scrollV`, `@flighthq/text` `setRichTextScrollH/V` (via `export *`), and `@flighthq/textlayout` `TEXT_BOUNDS_GUTTER` all exist in head — the scroll/layout dependencies are real; only the textinput-owned header is missing.

## Score

`partial — 38`. The feature design and code body are AAA-shaped and would score in the 80s once they build; the score is dominated by the merge-gate fact that the delta does not compile against its own snapshot (missing types delta + barrel gap + test fixtures). Not mergeable as captured.
