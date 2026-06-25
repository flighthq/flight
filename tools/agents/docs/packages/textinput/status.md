---
package: '@flighthq/textinput'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# textinput — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` `## Recommended`. The committed source had already advanced past the state the assessment describes: `textInputEditing.ts` already defines all five "missing" helpers (`recordTextInputEdit`, `applyHistoryRecord`, `getCaretLineIndex`, `getLineStartIndex`, `getLineEndIndex`) and compiles, and `textInputEditing.test.ts` already carries `describe` blocks for the full Silver surface (`canRedoTextInput`, `canUndoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineStart`/`ToLineEnd`, `redoTextInput`, `scrollTextInputCaretIntoView`, `undoTextInput`). The types (`TextInputHistoryEntry`, `history`/`historyIndex`/`historyLimit` on `TextInputState`) are present in `@flighthq/types`.

Done:

- **Barrel exports (Recommended #2).** Added the eight Silver functions — `canRedoTextInput`, `canUndoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineEnd`, `moveTextInputCaretToLineStart`, `redoTextInput`, `scrollTextInputCaretIntoView`, `undoTextInput` — to `src/index.ts`, kept alphabetized within the `textInputEditing` re-export block. They were already `export function` in source but unreachable from `@flighthq/textinput`.
- **Dependency hygiene (Recommended #5).** Dropped the stale `@flighthq/displayobject` dependency from `package.json`; no `src/` file imports it (verified by grep — the used deps are `node`, `signals`, `text`, `textlayout`, `types`).

Already satisfied in the committed tree (Recommended #1 and #3): the five private helpers compile and the colocated Silver tests exist. No source/test edits were needed for those beyond confirming them.

Verified: `npm run test --workspace=packages/textinput` → 4 files, 128 tests passing.

Parked:

- **Rebuild `dist/` + `npm run check` (Recommended #4).** Build output regeneration is outside this sweep's allowed commands (no `tsc -b` / `npm run check`). The barrel-export change means `dist/index.d.ts`/`.js` are now stale and must be rebuilt by a build pass before publish.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/textinput

**Session date:** 2026-06-24 **Previous score:** 74/100 (solid) **Estimated new score:** 84/100

## Implemented in this session

### Bronze additions

**Word-granular caret motion** (`textInputEditing.ts`):

- `moveTextInputCaretByWord(source, direction, extendSelection)` — moves the caret by one word in the given direction, reusing the `isWordChar` boundary logic from `selectWordAtTextInputIndex`. Negative direction = backward/left; positive = forward/right.
- Added helper functions `findWordStartBefore` and `findWordEndAfter` (private) with the skip-whitespace-then-skip-word-chars semantics matching platform behavior.
- Added `wordLeft` / `wordRight` commands to `getKeyboardCommand`: Ctrl+Left/Right (Windows/Linux) and Alt+Left/Right (macOS).

**Word deletion** (`textInputEditing.ts`):

- `deleteTextInputWordBackward(source)` — deletes one word backward from caret, or selection if non-collapsed.
- `deleteTextInputWordForward(source)` — deletes one word forward from caret, or selection if non-collapsed.
- Added `deleteWordBackward` / `deleteWordForward` commands: Ctrl+Backspace, Ctrl+Delete (and Alt+Backspace, Alt+Delete for macOS).

**Vertical caret navigation** (`textInputEditing.ts`, `@flighthq/types/TextInputState.ts`):

- Added `desiredCaretX: number` field to `TextInputState` (initialized to `-1` = unset). Horizontal motion and edits reset it; vertical motion reads and preserves it.
- `moveTextInputCaretDown(source, layout, extendSelection)` — moves the caret to the next line at the same x-column, preserving `desiredCaretX` across consecutive down-presses. Falls back to end-of-text when layout is null or caret is on last line.
- `moveTextInputCaretUp(source, layout, extendSelection)` — same pattern for previous line.
- Added `up` / `down` commands to `getKeyboardCommand` and switch cases in `handleTextInputKeyboard`.

**Layout parameter for vertical navigation** (`@flighthq/types/TextInputEditingOptions.ts`):

- Added `layout?: Readonly<TextLayoutResult> | null` to `HandleTextInputKeyboardOptions`. Without a layout, up/down fall back to document-start/end. The field is optional so callers that never need vertical navigation have no API change.

**Clipboard decoupling — Bronze** (`textInputManager.ts`, `selectableRichTextManager.ts`):

- Removed both `navigator.clipboard?.writeText(...)` calls that hard-wired the browser clipboard into the managers.
- `dispatchTextInputKeyDown` gains a new optional `onCopy?: (text: string) => void` parameter (added after `clipboardText`). This is a purely additive signature extension; existing callers are unaffected.
- `dispatchSelectableRichTextKeyDown` gains a matching `onCopy?: (text: string) => void` parameter. The copy path now fires the callback rather than calling the DOM API directly — making both managers testable and platform-neutral.
- The correct pattern for a web application layer is to pass `(text) => navigator.clipboard?.writeText(text)` at the call site; no helper was added to the core.

**New exports** (added to `index.ts`):

- `deleteTextInputWordBackward`
- `deleteTextInputWordForward`
- `moveTextInputCaretByWord`
- `moveTextInputCaretDown`
- `moveTextInputCaretUp`

**Tests added** (34 new test cases across 4 files):

- `textInputEditing.test.ts`: `deleteTextInputWordBackward` (4 cases), `deleteTextInputWordForward` (3 cases), `moveTextInputCaretByWord` (5 cases), `moveTextInputCaretDown` (5 cases), `moveTextInputCaretUp` (3 cases), extended `handleTextInputKeyboard` (9 new cases: word-left, word-right, word-delete backward, word-delete forward, down arrow with/without layout, up arrow with/without layout, onCopy callback, unhandled key).
- `textInputManager.test.ts`: `dispatchTextInputKeyDown` onCopy callback case (1 new).
- `selectableRichTextManager.test.ts`: onCopy invoked for copy command, onCopy not invoked for empty selection (2 new).
- `textInput.test.ts`: `moveTextInputCaret` resets desiredCaretX (1 new).

**Test count:** 71 → 105 (all passing).

## Deferred items and why

**Undo / redo** (Silver, medium effort): `TextInputEditRecord` must land in `@flighthq/types` first. Foundational and hard to retrofit, but it is an additive self-contained addition that does not require coordination with other packages in flight. Deferred to a follow-up session to keep this session focused on Bronze completeness.

**Caret-into-view auto-scroll** (Silver, medium/cross-package): The vertical path can reuse `setRichTextScrollV` from `@flighthq/text`. The horizontal path needs a new `setRichTextScrollH` / `scrollH` field in `@flighthq/text`, plus the four `displayobject-*` renderer-overlay packages to honor `scrollH` when drawing caret/selection. This is a multi-package change that should be coordinated rather than done unilaterally.

**Drag-select auto-scroll** (Silver): Depends on the same `scrollH` addition above, plus a viewport-bounds parameter on the pointer-move dispatchers. Depends on the auto-scroll work.

**Selection-model unification** (Silver): Adding `readOnly: boolean` to `TextInputState` and folding `SelectableRichTextManager` onto the editable selection model. Pre-release means no migration cost, but this is a meaningful API surface change that warrants an explicit design decision: one manager + `readOnly` flag vs keep two separate entry points. Surfacing to the user rather than deciding autonomously.

**Selection-changed / edit signals** (Silver): `enableTextInputSignals(source)` exposing `onTextInputChange`, `onTextInputCaretMove`, `onTextInputSelectionChange`. Low effort but depends on the unification decision above (signals should reflect the unified model). Deferred to after unification is decided.

**Home/End line-relative semantics** (Silver): Currently `home` moves to index 0 and `end` moves to `text.length`. In a multiline field these should go to the start/end of the current line, with Ctrl+Home/Ctrl+End for document extremes. This touches `getKeyboardCommand` and `handleTextInputKeyboard`; needs a layout to resolve the current line, so `HandleTextInputKeyboardOptions.layout` (added in this session) is the prerequisite. Deferred to Silver — the layout plumbing is now in place.

**IME / composition seam** (Gold, high effort): `TextInputComposition` in `@flighthq/types`, composition lifecycle functions, event wiring in `@flighthq/input` (`compositionstart`/`update`/`end`), and marked-text rendering in `displayobject-*` overlays. The largest remaining gap. Recording as "deferred pending explicit posture decision" per the roadmap guidance — building the seam vs documenting as deferred should be surfaced to the user.

**Grapheme-cluster correctness** (Gold): Move caret motion, deletion, and hit-testing from UTF-16 code-unit indexing to extended-grapheme-cluster boundaries. Depends on `@flighthq/textlayout` exposing grapheme boundaries or adding them there first. Requires TS + Rust simultaneous alignment on the index-semantics contract.

**Bidi-aware caret / selection** (Gold): Depends on `@flighthq/textlayout` bidi/RTL output.

**On-screen-keyboard bridge** (Gold): Connecting focus/blur to `@flighthq/keyboard` (`SoftKeyboard`). Cross-package.

**Accessibility descriptor** (Gold): Platform-neutral descriptor for AT mirroring. Data defined in `@flighthq/types`; consumed by a host backend.

**`textinput-formats` neighbor package** (Gold): Number/currency/date/credit-card mask formatters. New package; requires `npm run packages:check` and a formatter seam design.

**Performance rope/gap-buffer** (Gold): Replace O(text-length) string rebuild on every keystroke. Behind the current public signatures; safe to do last without churn.

**Rust parity** (ongoing): The Rust crate `flighthq-textinput` already mirrors the five existing source files. Each Bronze addition above should be ported in lockstep; functional scene for the parity differ has not yet been added.

## Concerns and surprises

**The two-selection-model smell remains.** `SelectableRichTextManager` uses `runtime.selectionBeginIndex/selectionEndIndex` on the `RichTextRuntime`, while the editable path uses `TextInputState.caretIndex/selectionIndex`. This creates two representations of "a selected range." The clipboard decoupling in this session did not unify them — that is the Silver unification item. Worth doing before the API hardens.

**`dispatchTextInputKeyDown` signature change.** The old signature was `(manager, data, clipboardText?)`. The new signature is `(manager, data, clipboardText?, onCopy?)`. This is additive and backward-compatible, but callers who previously passed `onCopy` indirectly via `handleTextInputKeyboard` options now have a direct path. The old test (`dispatchTextInputKeyDown(manager, keyData)`) still passes unmodified — good.

**`home`/`end` are still document-global.** Now that `HandleTextInputKeyboardOptions.layout` exists, making them line-relative is mechanical. This was not done in this session to stay focused on Bronze, but it is a UX regression compared to any real editor. The `layout` field is the prerequisite and is now in place.

**`deleteTextInputWordBackward` word-skip semantics.** The implementation skips non-word characters first (whitespace/punctuation), then removes the preceding word — matching platform behavior on Windows/Linux (Ctrl+Backspace) and macOS (Alt+Backspace). This means `deleteTextInputWordBackward` at position 6 in `'hello world'` removes `'hello '` (both the word and the preceding space), leaving `'world'`. This is correct behavior for a text editor.

**Vertical navigation requires a layout.** `moveTextInputCaretDown`/`moveTextInputCaretUp` and the `down`/`up` keyboard commands need a `TextLayoutResult` to resolve the target character index. Callers that do not provide a layout get a fallback (move to document end/start). The managers (`TextInputManager`, `SelectableRichTextManager`) do not yet pass a layout to `dispatchTextInputKeyDown` — they would need to store a reference to the current layout from the last render to enable up/down from the manager-level API.

## Suggestions for future sessions

1. **Line-relative Home/End** is the easiest Silver win: `home` should move to line start (first char after `\n`), `end` to line end (char before `\n` or text end). Requires only the layout (already threaded through `HandleTextInputKeyboardOptions`) and a `getTextInputLineStart/End` helper using `selectLineAtTextInputIndex`'s existing scan logic.
2. **Pass layout into the managers**: `TextInputManager` and `SelectableRichTextManager` should cache the last known `TextLayoutResult` from their focused target so `dispatchTextInputKeyDown` can use it for vertical navigation without requiring callers to thread layout manually.
3. **Selection-model unification**: Add `readOnly: boolean` to `TextInputState`, merge the two selection representations, and decide the manager API shape (one manager vs two). Pre-release: no migration cost.
4. **Undo/redo**: `TextInputEditRecord` in `@flighthq/types`, bounded history on `TextInputState`, `undoTextInput`/`redoTextInput`/`canUndoTextInput`/`canRedoTextInput` as exported functions. Each edit function becomes a recording site. Coalesce consecutive same-kind chars into one record.
5. **IME posture decision**: Explicitly decide: build the composition seam now (high effort, correct international behavior) or document as deferred. If deferred, add a comment in `textInputManager.ts` explaining why and what the functional gap is.
