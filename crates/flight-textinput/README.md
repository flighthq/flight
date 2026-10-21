# flight-textinput

Portable opt-in editing and selection for `flight-text` `RichText` nodes. The crate owns the four
pinned `textinput/src` modules: input-state attachment, editing, editable-field management, and
selectable static-text management.

## Ownership and state

`TextInputManager` and `SelectableRichTextManager` are direct Entities with one standard private
runtime/UID slot. Input sources, editing options, and edit records are plain typed records. Editable
state stays in the canonical `RichTextRuntime.input` slot and uses the text-owned `TextInputState`,
`TextInputHistoryEntry`, and `TextInputOptions` records. Disabling input detaches only that slot; it
does not alter text or serialized rich-text data.

No input, clipboard, DOM, or native provider is created here. Managers consume normalized
`flight-input` signals, optional clipboard values/callbacks, and the layout already cached on the
target. Signal connections return a disposer that removes both registrations.

## UTF-16 and navigation

All public caret, selection, history, format-range, and hit-test offsets are UTF-16 code-unit
offsets. User-visible left/right motion and deletion use canonical `flight-textsegment` grapheme
boundaries, and word operations use its canonical Unicode word segmentation. Layout coordinates,
caret geometry, selection rectangles, desired-x vertical navigation, and one-based vertical scroll
match the pinned source behavior.

## Export lanes and sugar

The crate root follows `textinput/src/index.ts`. Construction initializers stay contract-only.
`RichTextInputMethods`, `TextInputManagerMethods`, and `SelectableRichTextManagerMethods` are D18
thin delegates, while both manager types expose `new` sugar for their factories. Plain records do
not receive Rust-only constructors.

## Verification

The integration suite ports all 150 pinned source cases and adds four focused UTF-16/grapheme/word
checks. Separate inline tests compare the D18 method and constructor paths with the canonical free
functions.
