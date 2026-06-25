---
package: '@flighthq/textinput'
updated: 2026-06-25
basedOn: ./review.md
---

# textinput — Assessment

Sorted from `review.md` (merge-gate review of the `integration-b2824e3d8` delta vs `origin/main` `eb73c3d74`; score `partial — 38`). The incoming change is a well-shaped AAA feature expansion (word/vertical motion, undo/redo, line-relative Home/End, caret-scroll-into-view, explicit-callback clipboard) whose code body is sound — but the captured delta **does not compile against its own snapshot**: it depends on `@flighthq/types` fields and types that were never added to the header, leaves eight implemented+tested functions out of the barrel, and ships test fixtures with an undeclared `timeStamp` field. That makes `Recommended` unusually large _and_ unusually safe: the work is finishing what is already in the tree — within `@flighthq/textinput` plus its own header in `@flighthq/types` — no redesign, no new design decision. The genuine design forks (selection-model unification, IME posture, formatter neighbor) stay parked in Backlog and route to the charter's Open directions.

## Recommended

Sweep-safe: completes the captured feature, no open design decision. Items 1–3 are one coherent "make the delta build, ship its surface, and keep tests honest" repair and must be done together — none is independently mergeable.

- **Extend the textinput header in `@flighthq/types` to match the implementation.** Add to `TextInputState`: `caretColor`, `caretWidth`, `desiredCaretX`, `history: TextInputEditRecord[]`, `historyIndex`, `historyLimit`. Add to `TextInputOptions`: `caretColor?`, `caretWidth?`, `historyLimit?`. Add to `ReplaceTextInputOptions`: `mergeKind?: string | null`, `skipHistory?: boolean`. Add `layout?: Readonly<TextLayoutResult>` to `HandleTextInputKeyboardOptions`. Add a new `TextInputEditRecord` type (`textBefore`/`textAfter`/`caretIndex{Before,After}`/`selectionIndex{Before,After}`/`mergeKind`). The exact field set is pinned by the literals and reads in `textInput.ts:53-69` and `textInputEditing.ts:459-460, 745-783`. This is the types-first contract being satisfied retroactively — do it as the first step. — review.md §1.

- **Resolve the `InputTextData` reference.** `textInputManager.ts:3,23` imports `InputTextData` from `@flighthq/types`, which does not exist; the `onTextInput` signal payload is `TextSelectionRange` (`InputSignals.ts:21`). Either add an `InputTextData` type to `@flighthq/types` and retype the `onTextInput` signal to it, or revert the import to `TextSelectionRange`. Pick one and make the signal type and the handler agree. — review.md §1.

- **Add `timeStamp` to `InputKeyboardData`** (or drop it from the fixtures). The tests set `timeStamp: 0` (`selectableRichTextManager.test.ts:30`, `textInputManager.test.ts:47`) against an interface that has no such field. If keyboard events carry a timestamp, add `timeStamp: number` to `InputKeyboardData`; otherwise remove the fixture lines. — review.md §2.

- **Export the eight missing functions from the barrel.** Add `canRedoTextInput`, `canUndoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineEnd`, `moveTextInputCaretToLineStart`, `redoTextInput`, `undoTextInput`, and `scrollTextInputCaretIntoView` to `index.ts` (kept alphabetized; run `npm run order:fix`). They are already `export function` in `textInputEditing.ts` but unreachable from `@flighthq/textinput`, so `exports:check` fails. — review.md §3.

- **Run the full gate before re-submitting.** `npm run check` (which runs `typecheck` + `exports:check` + `order:check`) must pass; the current delta would fail typecheck and exports:check. Add a colocated `describe` for any function still lacking one after the barrel fix. — review.md §3.

## Backlog

Parked: cross-cutting design, not sweep-safe, or a charter Open direction.

- **Selection-model unification across `textinput` and the read-only `selectableRichText` managers.** Both now carry near-duplicate copy/selection logic and the `onCopy` callback threading; whether they should share one selection primitive is a design fork, not a within-package sweep. — route to charter Open directions.
- **IME / composition-event posture.** Vertical nav, word motion, and undo coalescing all assume discrete keystrokes; composed input (CJK IME) has no story here. A real decision about the input seam, not a finish-the-feature task. — route to charter Open directions.
- **Clipboard ownership after the `navigator.clipboard` removal.** The package now delegates copy to an `onCopy` callback (good), but who owns the actual system-clipboard write — the host, `@flighthq/clipboard`, or the app — is an unsettled cross-package boundary. — route to charter Open directions.
- **`historyLimit` / merge-coalescing policy defaults.** The 100-entry default and `mergeKind` string convention are reasonable but unblessed; worth a charter decision before they ossify into public API. — park until direction.

## Approved

_None. Approval is the user's verbal gate; nothing is moved here until the user blesses it in a direction session._

## Notes for the charter's Open directions

The delta surfaces four forks the charter should record rather than have an agent decide: (1) one shared selection primitive across the editable and read-only managers; (2) the IME/composition input seam; (3) clipboard write-ownership now that copy is a callback; (4) the `historyLimit`/`mergeKind` undo-grouping policy as public contract. None should enter `Recommended` — they are direction questions for the user.
