# Depth Review: @flighthq/textinput

**Domain**: Editable-text-field behavior — caret/selection model, text insertion/deletion/replacement, keyboard and pointer editing commands, input restrictions, password masking, and the focus/dispatch managers that wire raw input into one focused field. The OpenFL/Flash `TextField` "input" mode (TextFieldType.INPUT) plus a read-only "selectable text" mode, expressed as free functions over a `RichText` entity and its runtime input slot.

**Verdict**: solid — 74/100

This is a genuinely thorough text-editing core, not a stub. It covers the full caret/selection/edit/restrict/password feature set that defines the domain, with correct edge handling (alias-safe-ish index clamping, format-range adjustment on edit, word/line selection, multi-click). It falls short of "authoritative" because several behaviors a mature text-input library is expected to own are absent (word-granular caret motion, undo/redo, up/down vertical caret navigation, IME composition), and a few host concerns leak into the otherwise-pure core.

## Present capabilities

Enablement / runtime slot (`textInput.ts`):

- `enableTextInput` / `disableTextInput` / `hasTextInput` / `getTextInputState` — opt-in runtime slot pattern, idempotent enable, options applied on re-enable. Matches the SDK `enable*` convention.
- `TextInputOptions` surface: `restrict`, `displayAsPassword`, `passwordCharacter`, `alwaysShowSelection`, `selectionColor`, `selectionAlpha` — the canonical OpenFL `TextField` input properties, with OpenFL-matching defaults (`•`, `0x0078d7`, 0.35).

Selection / caret model (`textInputEditing.ts`):

- `setTextInputSelection`, `getTextInputSelectionBeginIndex`/`EndIndex`, `getTextInputSelectionText`, `selectAllTextInput`.
- `moveTextInputCaret` with `extendSelection`, `getTextInputCaretIndex`.
- `selectWordAtTextInputIndex`, `selectLineAtTextInputIndex` — word/line granular selection (double/triple-click semantics).
- `getTextInputCaretRectangle`, `getTextInputSelectionRectangles` — geometry out-params for caret blink + selection highlight, line-aware with fallback line height.
- `getTextInputCharacterIndexAtPoint` — hit-testing a point to a character index, with nearest-line resolution and half-advance rounding. Strong.

Editing (`textInputEditing.ts`):

- `insertTextInput`, `appendTextInput`, `replaceTextInput`, `replaceSelectedTextInput`, `deleteTextInputBackward`/`Forward`.
- `adjustTextFormatRanges` — a real implementation of shifting/splitting/dropping `TextFormatRange`s across an insert/delete, including the empty-insert and collapse-to-default cases. This is the hard part of editable rich text and it is present.
- `applyTextInputRestriction` + the `restrictTextInput`/`splitRestrictRanges`/`matchesRestrictRanges` engine — full OpenFL `restrict` grammar: `^` exclusion toggling, `a-z` ranges, `\` escapes. Plus `maxChars` clamping and multiline newline stripping.
- `getTextInputDisplayText` — password masking with custom character.

Keyboard command mapping (`handleTextInputKeyboard` + `getKeyboardCommand`): backspace, delete, home, end, left, right, return (multiline-gated), select-all, copy, cut, paste, with ctrl/meta modifier handling and a `KeyboardCommand` union. Copy/cut delegate via `onCopy` callback; paste takes injected `clipboardText` — good separation.

Managers:

- `TextInputManager` (editable): `create`/`focus`/`blur`, pointer down (with `clickCount` for double/triple), pointer move (drag-select), wheel (scrollV), keyDown, textInput, plus `connectInputToTextInput` wiring `@flighthq/input` signals.
- `SelectableRichTextManager` (read-only selection): focus/blur, pointer down/move drag-select, wheel scroll, keyDown for select-all + copy, `getSelectableRichTextSelectionText`.

## Gaps vs an authoritative text-input library

Missing-by-omission (would be expected in a mature library, and nothing in the architecture precludes them):

- **Word-granular caret motion.** There is word/line _selection_ but no Ctrl/Alt+Left/Right "move caret by word" or word-delete (Ctrl/Alt+Backspace, `deleteWordBackward`/`deleteWordForward`). This is standard in every editable field.
- **Vertical caret navigation.** No Up/Down arrow handling, no PageUp/PageDown, no "caret stays in column" desired-x tracking across lines. For a multiline field this is a core omission — `handleTextInputKeyboard` simply has no `up`/`down` command.
- **Undo / redo.** No edit history, no `undoTextInput`/`redoTextInput`, no command/transaction grouping. An authoritative editing core is expected to own this (or at least an edit-record seam others can build on).
- **IME / composition.** No composition-string lifecycle (`compositionstart`/`update`/`end`), no marked-text range, no composition rendering. Required for CJK and many mobile keyboards; OpenFL leans on the OS field, but a from-scratch input core that renders its own caret must address it or explicitly defer it.
- **Caret-driven auto-scroll.** Wheel scrolling exists, but there is no "scroll to keep caret visible" on edit/caret-move, and no horizontal scroll (`scrollH`) for single-line fields that overflow. `getTextInputCaretRectangle` gives the data, but nothing consumes it for scroll-into-view.
- **Click-to-deselect / caret placement on empty.** Minor, but no explicit "click outside text clears selection to caret."
- **Mouse-selection drag auto-scroll** when the pointer leaves the field bounds during a drag-select.

Missing-by-design / out-of-scope (correctly delegated, not faults):

- Actual rendering of caret/selection/password text is the renderers' job (`drawCanvas/Dom/Gl/Wgpu TextInputOverlay` in the `displayobject-*` packages) — correct cellular split.
- Clipboard _transport_ is delegated via `onCopy`/`clipboardText` injection — correct for the pure core.
- Raw DOM input attachment lives in `@flighthq/input` (`attachTextInput`) — correct.
- Glyph shaping/measurement is `@flighthq/textlayout` — correct.

## Naming / API-shape notes

- Names are exemplary against the project rules: every function carries the full `TextInput` type word, `get*`/`has*`/`is*` prefixes are correct, out-param functions (`getTextInputCaretRectangle`, `getTextInputSelectionRectangles`) write into `out` first arg. Editing functions allocate nothing.
- The two-manager split (`TextInputManager` editable vs `SelectableRichTextManager` read-only) is a reasonable distinction, but it is a **near-duplicate surface**: both have focus/blur/pointerDown/pointerMove/wheel/keyDown, and the selectable variant reimplements selection on `runtime.selectionBeginIndex/EndIndex` while the editable variant uses the input slot's `caretIndex/selectionIndex`. Two selection models for "a range of selected characters" is a depth/consistency smell — an authoritative library would unify on one selection representation and let "editable" be a superset of "selectable."
- Leaks in the otherwise-pure core: `dispatchTextInputKeyDown` and `dispatchSelectableRichTextKeyDown` call `navigator.clipboard?.writeText(...)` directly. The editing layer correctly uses an `onCopy` callback, but the managers hard-wire the web clipboard, which couples them to the browser and bypasses the `@flighthq/clipboard` backend seam. This both hurts testability and contradicts the platform-suite design.
- `getInputState` throws on a not-enabled `RichText` (documented as API misuse) — consistent with the "throw only for programmer error" rule.
- `applyTextInputRestriction` is exported as a `Readonly<RichText>` pure transform — good, reusable by validators.

## Recommendation

Treat as **solid, on the path to authoritative**, and close the editing-completeness gaps within scope:

1. Add word-granular motion and deletion: `up`/`down`/`wordLeft`/`wordRight`/`deleteWordBackward`/`deleteWordForward` commands in `handleTextInputKeyboard`, reusing the existing `isWordChar` boundary logic; add vertical navigation with a remembered desired-x.
2. Add an undo/redo seam — even a minimal `TextInputEditRecord` stack with `undoTextInput`/`redoTextInput` and coalescing of consecutive typing — since this is foundational to the domain and hard to retrofit later.
3. Add caret-scroll-into-view (vertical `scrollV` on edit/caret-move, and `scrollH` for single-line overflow), consuming `getTextInputCaretRectangle`.
4. Decide IME posture explicitly: either add a composition seam (marked-text range + lifecycle) or record it as missing-by-design in the docs with the rationale.
5. Unify the selection representation across the two managers, and route clipboard through the `@flighthq/clipboard` backend (or an injected callback) instead of `navigator.clipboard` to remove the browser coupling.

With word/vertical motion, undo, and caret-scroll added, this package would reach authoritative depth for the editable-text-field domain.
