# TS↔Rust Alignment: @flighthq/textinput

**Verdict:** Near-perfect alignment — 41 of 42 exported functions, all four filenames, and all naming/out-param/sentinel conventions track 1:1; the lone gap is `connectInputToTextInput`, which is entirely absent from the Rust crate and is **not** recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `connectInputToTextInput` (`textInputManager.ts`) | _(none)_ (`text_input_manager.rs`) | **Missing port.** No `connect_input_to_text_input` fn, no test, no `lib.rs` re-export. The helper wires an `@flighthq/input` `TextInputSource` (its `onKeyDown` / `onTextInput` signals) to a `TextInputManager` and returns a teardown closure. The supporting `TextInputSource` type is also absent from `flighthq-types`. This may be a defensible divergence (signal-wiring glue over the web-flavored input source, analogous to web event `attach*`/`detach*` helpers that the native port handles differently), but it is **silent drift** — not in `rust/conformance.md`. Either port it or add a divergence-map entry with a rationale. |
| package `@flighthq/textinput` | crate `flighthq-textinput` | In sync, and the rename history (`text-input` → `textinput`, 2026-06-23) is already recorded in the divergence map line 40. Noted here only because the basename changed recently; no action. |

## In sync

- **Crate name:** `@flighthq/textinput` → `flighthq-textinput` is identity (post-rename), recorded in the divergence map.
- **Filenames (4/4 track):** `selectableRichTextManager.ts`↔`selectable_rich_text_manager.rs`, `textInput.ts`↔`text_input.rs`, `textInputEditing.ts`↔`text_input_editing.rs`, `textInputManager.ts`↔`text_input_manager.rs`. Each Rust basename is the snake_case of its TS counterpart; no drift.
- **Function names (41/42):** every other export maps 1:1 with camelCase→snake_case and the full type word preserved — e.g. `getTextInputSelectionRectangles`→`get_text_input_selection_rectangles`, `dispatchSelectableRichTextPointerDown`→`dispatch_selectable_rich_text_pointer_down`, `selectWordAtTextInputIndex`→`select_word_at_text_input_index`. No abbreviations, no unreasoned renames, no extra Rust-only functions.
- **Conventions:** out-params carry across (`getTextInputCaretRectangle(out, …)` / `getTextInputSelectionRectangles(out, …)` → `&mut` first arg in Rust); sentinels preserved (`getTextInputState(): TextInputState | null` → `Option`); verb families (`create_text_input_manager`, `enable_text_input`, `disable_text_input`, `blur_text_input`, `focus_text_input`) match. No `dispose_`/`destroy_`/`acquire_`/`release_` in this package, so none to reconcile.
- **`rust:conformance` row:** `textinput | 42 | 41 | 53 | 1 ⚠️` — the single warning is exactly the `connectInputToTextInput` gap above; no other discrepancy.

## Divergence-map action

Add an entry to `tools/agents/docs/rust/conformance.md` covering `connectInputToTextInput` (and the `TextInputSource` type it depends on): either record it as an intentional TS-only / web-input-wiring divergence with a rationale, or track it as a pending port. Today it is undocumented drift, which is the one thing the map exists to prevent.
