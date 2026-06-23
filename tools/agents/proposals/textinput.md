---
id: textinput
title: '@flighthq/textinput'
type: depth
target: textinput
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/textinput.md
  - tools/agents/docs/reviews/depth/textinput.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 74/100. A genuinely thorough editable-text core (caret/selection/edit/restrict/password + focus/dispatch managers) that falls short of authoritative on word/vertical caret motion, undo/redo, IME composition, caret-driven auto-scroll, and a few host leaks in the otherwise-pure managers.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable closure: the editing motions every user expects from a desktop field, plus removing the browser coupling that breaks testability. These are additive to `textInputEditing.ts` / the `KeyboardCommand` union and require no new entity.

- **Word-granular caret motion.** `moveTextInputCaretByWord(source, direction, extendSelection)` reusing the existing `isWordChar` boundary logic; add `wordLeft` / `wordRight` to the `KeyboardCommand` union with Ctrl/Alt+Left/Right mapping in `getKeyboardCommand`.
- **Word deletion.** `deleteTextInputWordBackward(source)` / `deleteTextInputWordForward(source)`; add `deleteWordBackward` / `deleteWordForward` commands (Ctrl/Alt+Backspace, Ctrl/Alt+Delete).
- **Vertical caret navigation.** `up` / `down` commands in `handleTextInputKeyboard` that resolve the target index via the existing line geometry (`getTextInputCharacterIndexAtPoint` against the caret's current x on the adjacent line). Store a `desiredCaretX: number` on `TextInputState` so vertical motion keeps its column across short lines (reset on any horizontal motion or edit).
- **Route clipboard through a seam, not `navigator.clipboard`.** Remove the two hard-wired `navigator.clipboard?.writeText(...)` calls in `textInputManager.ts` and `selectableRichTextManager.ts`. Make copy/cut go through the existing `onCopy` callback for the editable manager, and add a matching `onCopy` to `dispatchSelectableRichTextKeyDown`. Provide a small `createWebTextInputClipboard()` helper in an examples/app layer (not the core) so the default still "just works" on web without the core importing a browser global.
- **Click-to-caret on empty / click-to-deselect.** A single pointer-down with no drag collapses any prior selection to the hit index (today's path works, but make it explicit and tested for the "click past end of text" and "click on empty field" cases).
- **Tests** for every new function and command, including alias-safe index cases and multiline vertical motion at first/last line boundaries.

### Silver

Competitive with a good editable-text library: undo/redo, caret-into-view scrolling, and unification of the two selection models so "selectable" is a true subset of "editable."

- **Undo / redo seam.** Define `TextInputEditRecord` in `@flighthq/types` (before/after text slice, range, selection-before/after, a `mergeKind` for coalescing). Add a bounded history on `TextInputState` (or a sibling runtime slot) and free functions `undoTextInput(source)` / `redoTextInput(source)` / `canUndoTextInput` / `canRedoTextInput` / `clearTextInputHistory`, plus `beginTextInputEditGroup` / `endTextInputEditGroup` for transaction grouping. Coalesce consecutive single-character typing and consecutive deletes into one record; break the group on caret jump, paste, or focus change. Wire `undo` / `redo` commands into `getKeyboardCommand` (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Ctrl+Y).
- **Caret-into-view auto-scroll.** `scrollTextInputCaretIntoView(source, layout, viewportWidth, viewportHeight)` consuming `getTextInputCaretRectangle`: vertical via the existing `setRichTextScrollV`, plus a new horizontal `scrollH` path (`setRichTextScrollH` in `@flighthq/text`, surfaced here) for single-line fields that overflow. Call it on edit and caret-move inside the managers.
- **Drag-select auto-scroll.** When a pointer-move during drag-select leaves the field bounds, advance `scrollV`/`scrollH` toward the pointer so selection can extend past the visible region. `dispatchTextInputPointerMove` / `dispatchSelectableRichTextPointerMove` gain a viewport-bounds argument.
- **Unify the selection representation.** Collapse the `SelectableRichTextManager` `runtime.selectionBeginIndex/EndIndex` model onto the same `TextInputState` `caretIndex/selectionIndex` representation used by the editable path. Make selectable mode an editable field with editing disabled (a `readOnly: boolean` on `TextInputState`), so one selection/caret/copy code path serves both. Keep the two manager entry points only if their event surfaces genuinely differ after unification; otherwise fold into one manager with a `readOnly` flag and deprecate the duplicate surface.
- **Selection-changed and edit signals (opt-in).** `enableTextInputSignals(source)` exposing `onTextInputChange`, `onTextInputCaretMove`, `onTextInputSelectionChange` via `@flighthq/signals`, so app code can react without polling. Strictly opt-in per the `enable*` convention; zero cost when unused.
- **Home/End line-relative semantics.** Make `home`/`end` go to line start/end (not document start/end) in multiline fields, with `Ctrl+Home`/`Ctrl+End` for document extremes — matching every real editor.
- **`maxChars` / restrict feedback.** Return a result (or signal) when an insert is rejected or truncated by `restrict`/`maxChars` so UIs can flash/beep, rather than silently dropping characters.

### Gold

Authoritative for the editable-text-field domain: IME, accessibility, full international handling, performance, and 1:1 Rust parity with a conformance scene.

- **IME / composition seam.** Define `TextInputComposition` in `@flighthq/types` (marked-text range, segments, selected segment). Add `beginTextInputComposition` / `updateTextInputComposition` / `endTextInputComposition` / `getTextInputComposition`, with the composition range exposed for renderers to underline marked text. Wire `compositionstart` / `compositionupdate` / `compositionend` through `@flighthq/input` (`attachTextInput`) into the manager. This is required for CJK and many mobile keyboards and is the single largest remaining gap.
- **Grapheme-cluster correctness.** Move caret motion, deletion, word/line selection, and hit-testing from UTF-16 code-unit indexing to extended-grapheme-cluster boundaries (emoji, ZWJ sequences, combining marks, surrogate pairs) so backspace deletes one perceived character. Add `getTextInputGraphemeBoundary*` helpers; keep the public index contract documented (code-unit vs cluster) and consistent across TS and Rust.
- **Bidi-aware caret and selection.** Honor the `@flighthq/textlayout` bidi/RTL output for caret placement, visual-order arrow motion, and selection rectangles (logical-vs-visual movement). Define the visual/logical motion mode in `@flighthq/types`.
- **On-screen-keyboard integration.** Bridge to `@flighthq/keyboard` (`SoftKeyboard`) so focusing a field can request the soft keyboard and auto-scroll the field clear of the keyboard inset; release on blur.
- **Accessibility seam.** A descriptor (role, value, selection, editable/readOnly, placeholder) so a host accessibility backend can mirror the field to AT — defined as data in `@flighthq/types`, populated by the manager, consumed by a host backend (no DOM coupling in the core).
- **Input-rule / formatter seam.** A registerable `TextInputFormatter` (`*Kind` string identifier) for masked/numeric/date fields layered above `restrict`, with a small **`@flighthq/textinput-formats`** neighbor package for the common formatters (number, currency, date, credit-card mask) so the core stays lean and the importers tree-shake.
- **Performance.** Replace the O(text-length) string rebuild + `adjustTextFormatRanges` scan on every keystroke with an incremental piece/rope or gap-buffer behind the existing function signatures (no public-API change), and benchmark large-document typing/paste. Cache word/grapheme boundary scans against an edit version.
- **Full keyboard-command coverage and platform key maps.** PageUp/PageDown, Shift-variants of every motion, platform-correct word-motion modifier (Alt on macOS, Ctrl on Windows/Linux), Delete-to-line-end (Ctrl+K), transpose, etc., driven by a swappable key-map table rather than inline conditionals in `getKeyboardCommand`.
- **Rust 1:1 conformance.** Port every Bronze/Silver/Gold addition into `flighthq-textinput` (the crate already mirrors the current five files). Add a `flighthq-functional` scene exercising type → select → word-motion → undo/redo → IME so the parity differ can compare `rust:skia` against `ts:canvas`, and record any intentional divergence (e.g. clipboard transport) in the conformance map.
- **Docs.** A package guide covering the editable-vs-readOnly model, the clipboard/IME/formatter seams, index semantics (code-unit vs grapheme), and the keyboard-command map — the canonical reference for the domain.

## Sequencing & effort

Recommended order, with dependencies and cross-package items flagged.

1. **Bronze, self-contained first (low effort, in-package).** Word motion, word delete, vertical navigation (`desiredCaretX` on `TextInputState` is the only `@flighthq/types` change), and click-to-caret are all additive to `textInputEditing.ts` and the `KeyboardCommand` union. Do these before any structural change — they harden the core and surface the line-geometry helpers Silver reuses.
2. **Clipboard de-coupling (Bronze, low effort but cross-package decision).** Removing `navigator.clipboard` is small, but _where the default web clipboard lives_ is a design decision to surface: route through `onCopy` only, or wire the editable manager to `@flighthq/clipboard`'s backend seam. Recommend `onCopy`-only in the core (keeps it pure and testable) with a web helper in the app/examples layer. **Surface this to the user.**
3. **Undo/redo (Silver, medium effort, types-first).** `TextInputEditRecord` must land in `@flighthq/types` first. Foundational and hard to retrofit, so do it early in Silver — but after Bronze edit-functions exist, because each becomes an undo-recording site.
4. **Selection-model unification (Silver, medium effort, mild breaking change).** Adding `readOnly` to `TextInputState` and folding `SelectableRichTextManager` onto the editable selection model touches `@flighthq/types`, both managers, and their tests. Pre-release status means no migration burden — do it deliberately rather than carrying two selection models forward. **Surface the manager-merge decision (one manager + `readOnly`, vs keep two entry points) to the user.**
5. **Caret-into-view + drag auto-scroll (Silver, medium effort, cross-package).** Vertical reuses `setRichTextScrollV`; **horizontal needs a new `setRichTextScrollH` / `scrollH` field in `@flighthq/text`** — a cross-package addition to coordinate. Renderers (`displayobject-*` overlays) must honor `scrollH` when drawing the caret/selection, so this also touches the four render packages.
6. **Signals + line-relative Home/End + restrict feedback (Silver, low-medium).** Independent; slot in after unification so the change/selection signals reflect the unified model.
7. **IME (Gold, high effort, cross-package).** `TextInputComposition` in `@flighthq/types`, composition lifecycle in this package, event wiring in `@flighthq/input`, and marked-text rendering in the `displayobject-*` overlays. The largest single item; gate the rest of Gold behind an explicit IME-posture decision (build the seam vs document-as-deferred). **Surface this to the user.**
8. **Grapheme + bidi correctness (Gold, high effort).** Depends on cluster/bidi data from `@flighthq/textlayout`; verify that package exposes grapheme boundaries and visual-order runs, or add them there first. Coordinate the index-semantics contract (code-unit vs cluster) across TS and Rust simultaneously to avoid a conformance divergence.
9. **`textinput-formats` neighbor package + formatter seam (Gold).** New package via the `-formats` pattern; copy a nearby package shape and run `npm run packages:check`.
10. **Performance rope/gap-buffer + Rust parity + functional scene + docs (Gold, ongoing).** Performance is behind stable signatures so it can land last without churn. Rust parity should track each tier as it lands rather than batching at the end — the crate is already at parity today, and letting it drift defeats the conformance goal.

Cross-cutting checkpoints: run `npm run check` and `npm run exports:check` after each function-set lands (every export needs a colocated test), `npm run order:fix` after adding exports, and `npm run api` after public-API changes to keep naming symmetry. After the `@flighthq/text` `scrollH` and renderer-overlay changes, run `npm run size` and a functional capture across backends.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/textinput` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
