---
package: '@flighthq/textinput'
updated: 2026-08-08
by: principal
---

# textinput — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/textinput/src/` (and `packages/types/src/`) on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Two representations of "a selected range" coexist.** The read-only path stores selection on the
  rich-text runtime (`selectableRichTextManager.ts:9-10`, `:62-65`, `:92-93`); the editable path
  stores it on `TextInputState.caretIndex`/`selectionIndex`
  (`packages/types/src/TextInputState.ts:21-40`, which has no `readOnly` field). Whether to fold the
  two managers onto one model behind a `readOnly` flag, or keep two entry points, is a design ruling
  and not an agent's to take.
- **Indexing is UTF-16 code units throughout.** `deleteTextInputBackward` removes `[start-1, start)`
  (`textInputEditing.ts:70`) and `deleteTextInputForward` removes `[start, start+1)` (`:82`), so a
  single Backspace splits a surrogate pair and leaves a lone half. Grapheme-cluster boundaries would
  have to come from a segmentation source this package does not depend on.
- **No signals group.** There is no `enableTextInputSignals`; `@flighthq/signals` is a dependency used
  only to connect and disconnect the input source (`textInputManager.ts:1`). A caller cannot observe
  text change, caret move, or selection change without polling.
- **No IME / composition seam.** Nothing in `src/` mentions composition — no marked-text state, no
  `compositionstart`/`update`/`end` handling, no lifecycle type in `@flighthq/types`. This is the
  largest functional gap and needs an explicit posture decision (build it, or record it as a stated
  non-goal) before it can be scoped.
- **The manager path never scrolls the caret into view.** `scrollTextInputCaretIntoView`
  (`textInputEditing.ts:476`) is exported but has no caller in this package, and
  `dispatchTextInputPointerMove` (`textInputManager.ts:87`) extends the selection without scrolling —
  so drag-selecting past the visible region silently stops tracking.
- **Every edit rebuilds the whole string.** `replaceTextInput` does
  `text.slice(0, start) + value + text.slice(end)` (`textInputEditing.ts:459`) plus a full history
  record, so cost is O(document) per keystroke. A rope or gap buffer fits behind the current
  signatures.
- **No soft-keyboard bridge and no accessibility descriptor.** `package.json` does not depend on
  `@flighthq/keyboard`, so focus/blur raises nothing on touch platforms, and no platform-neutral
  descriptor exists for an AT host to mirror.
- **No guard module.** There is no `enableTextInputGuards`, so the common caller mistakes — dispatching
  to an unfocused manager, editing a field that never called `enableTextInput`, passing no layout to
  vertical motion — are silent.
- Caret and selection are direction-agnostic; a bidi-aware caret depends on `@flighthq/textlayout`
  producing visual order, which it does not yet. Mask formatters (`textinput-formats`) do not exist.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three carried claims checked out
  **false**: "caret-into-view auto-scroll needs a new `setRichTextScrollH`/`scrollH` in
  `@flighthq/text` plus the four `scene2d-*` overlay packages" — `scrollH` exists,
  `setRichTextScrollH` is at `packages/text/src/richText.ts:489`, and
  `scrollTextInputCaretIntoView` already adjusts it (`textInputEditing.ts:513-514`), leaving only the
  unwired call site recorded above; "`home`/`end` are still document-global" — line-relative motion is
  at `textInputEditing.ts:351` and `:367`; and "undo/redo is deferred pending `TextInputEditRecord` in
  `@flighthq/types`" — history landed as `TextInputHistoryEntry` with `undoTextInput` / `redoTextInput`
  / `canUndoTextInput` / `canRedoTextInput` / `clearTextInputHistory`.
- **2026-07-30** — `dispatchTextInputKeyDown` passes the focused field's runtime layout to
  `handleTextInputKeyboard`, so connected input no longer uses the no-layout fallback.
- **2026-06-25** — Eight editing/history functions reached the barrel; stale `@flighthq/scene2d`
  dependency dropped.
- **2026-06-24** — Word-granular motion and deletion, vertical caret navigation with `desiredCaretX`,
  and clipboard decoupling behind an `onCopy` callback.
