# Filename Alignment: @flighthq/textinput

**Verdict:** Clean — this is a single-implementation domain package (not a backend-variant package, so no backend-prefix rule applies); every source file is named after a domain or an entity object, none after a single function, and tests mirror their sources.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

| File | Why it passes |
| --- | --- |
| `textInput.ts` | Names the core domain/object. Holds the lifecycle surface over a `RichText` input (`enableTextInput`, `disableTextInput`, `getTextInputState`, `hasTextInput`) — a domain, not one function. |
| `textInputEditing.ts` | Names the editing sub-domain. Covers the full edit/selection/caret/restriction operation set (`insertTextInput`, `replaceTextInput`, `moveTextInputCaret`, `selectWordAtTextInputIndex`, `applyTextInputRestriction`, etc.). Self-describing. |
| `textInputManager.ts` | Names the `TextInputManager` entity it operates over (create/connect/dispatch/focus/blur). Object name, not a function. |
| `selectableRichTextManager.ts` | Names the `SelectableRichTextManager` entity (selection-only manager for non-editable rich text). Object name, not a function. |
| `index.ts` | Standard barrel re-export; not a dumping ground (it only re-exports the four modules). |
| `*.test.ts` | Each test is colocated and mirrors its source filename exactly (`textInput.test.ts`, `textInputEditing.test.ts`, `textInputManager.test.ts`, `selectableRichTextManager.test.ts`). |
