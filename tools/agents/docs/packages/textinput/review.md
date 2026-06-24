---
package: '@flighthq/textinput'
status: partial
score: 58
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/textinput.md
  - source
  - changes.patch
  - charter.md
---

# textinput — Review

Evidence: `incoming/builder-67dc46d64/head/packages/textinput/` + `changes.patch` (committed/working split). Findings reference `67dc46d64:<path>`. This survey absorbs and supersedes the prior depth review (`reviews/depth/textinput.md`, verdict `solid — 74`) and the maturation roadmap (`reviews/maturation/depth/textinput.md`).

## Verdict

`partial — 58/100`. The _design_ of this package is genuinely strong — a complete OpenFL `TextField` caret/selection/edit/restrict/password core, word + vertical motion, an undo/redo seam, line-relative home/end, and caret-scroll-into-view are all present as source, and `@flighthq/types` carries the full header for all of it. But the committed source **does not compile**: `textInputEditing.ts` calls five helper functions (`recordTextInputEdit`, `applyHistoryRecord`, `getCaretLineIndex`, `getLineStartIndex`, `getLineEndIndex`) that are never defined or imported anywhere in the package. The new Silver functions are also **not exported from the barrel** (`index.ts`), and `dist/` reflects an older Bronze-only build that predates these edits. The status doc's central claim — that undo/redo, line-relative Home/End, and caret-scroll are "deferred to a follow-up session" — is materially false against the committed tree. The score reflects that a reviewer cannot trust the package builds or that its public surface matches its source; the underlying _design_ would score in the 80s once it compiles and is wired. This is a **broken intermediate**, not a stub and not a clean solid.

## Present capabilities (verified against source)

What follows is what the _source_ (`head/src/`) contains — distinct from what the barrel exports and what `dist/` realized (see Charter contradictions / Contract & docs fit for that gap).

**Enablement / runtime slot** (`textInput.ts`). `enableTextInput` / `disableTextInput` / `hasTextInput` / `getTextInputState` — the idempotent opt-in slot pattern on `RichTextRuntime.input`, matching the SDK `enable*` convention. `createTextInputState` now initializes the full `TextInputState`: `history: []`, `historyIndex: -1`, `historyLimit: 100` (clamped `Math.max(0, …)`), `desiredCaretX: -1`, `caretColor: 0x000000`, `caretWidth: 1`, plus the OpenFL-matching password/selection defaults (`•`, `0x0078d7`, `0.35`). `applyTextInputOptions` re-applies the configurable subset on re-enable. All field defaults verified.

**Selection / caret model + geometry** (`textInputEditing.ts`). `setTextInputSelection`, `getTextInputSelectionBeginIndex`/`EndIndex` (min/max with `clampIndex`), `getTextInputSelectionText`, `selectAllTextInput`, `moveTextInputCaret` (with `extendSelection`, resets `desiredCaretX`), `getTextInputCaretIndex`. `selectWordAtTextInputIndex` / `selectLineAtTextInputIndex` for double/triple- click. Out-param geometry: `getTextInputCaretRectangle`, `getTextInputSelectionRectangles` (delegates to `getRichTextSelectionRectangles`), and the strong `getTextInputCharacterIndexAtPoint` (nearest-line resolution + half-advance rounding via `getTextLayoutGroupCharacterIndexAtX`).

**Editing + format-range adjustment** (`textInputEditing.ts`). `insertTextInput`, `appendTextInput`, `replaceTextInput`, `replaceSelectedTextInput`, `deleteTextInputBackward`/`Forward`. `adjustTextFormatRanges` is a real implementation of shifting/splitting/dropping `TextFormatRange`s across insert/delete (empty-insert and collapse-to-default cases handled). The OpenFL `restrict` grammar is fully present: `restrictTextInput`/`splitRestrictRanges`/`matchesRestrictRanges` (`^` exclusion toggling, `a-z` ranges, `\` escapes), plus `maxChars` clamping and multiline newline stripping in `applyTextInputRestriction`. `getTextInputDisplayText` does password masking. This is the hard core of editable rich text and it is complete and well-factored.

**Word + vertical motion (Bronze, this session — wired and tested).** `moveTextInputCaretByWord(source, direction, extendSelection)` over `findWordStartBefore`/`findWordEndAfter` (skip-non-word-then-skip-word semantics); `deleteTextInputWordBackward`/`Forward`; and `moveTextInputCaretDown`/`Up` with `desiredCaretX` column preservation and a layout-null fallback to document end/start. `getKeyboardCommand` maps `wordLeft`/`wordRight`/`deleteWordBackward`/`deleteWordForward` (Ctrl on Win/Linux, Alt on macOS) and `up`/`down`. These five are exported from the barrel and have 34 new tests (`textInputEditing.test.ts` describe blocks confirm `moveTextInputCaretByWord`, `moveTextInputCaretDown`, `moveTextInputCaretUp`, `deleteTextInputWord*`). This part is solid.

**Undo/redo + line-relative + caret-scroll (Silver, committed — present in source, but broken/unwired).** `undoTextInput`, `redoTextInput`, `canUndoTextInput`, `canRedoTextInput`, `clearTextInputHistory`; `moveTextInputCaretToLineStart`/`ToLineEnd`; and `scrollTextInputCaretIntoView` (consuming `setRichTextScrollV`/`setRichTextScrollH` from `@flighthq/text`). `replaceTextInput` now records edits (`recordTextInputEdit(...)`, gated on `historyLimit > 0` and `skipHistory`). These are real, thoughtful implementations — but see Gaps: they reference undefined helpers, so the file does not compile, and none are exported from `index.ts`.

**Managers.** `TextInputManager` (`textInputManager.ts`): `create`/`focus`/`blur`, pointer-down with `clickCount` (double→word, triple→line), pointer-move drag-select, wheel→scrollV, keyDown, textInput, and `connectInputToTextInput` wiring `@flighthq/signals` `onKeyDown`/`onTextInput`. `SelectableRichTextManager` (`selectableRichTextManager.ts`): read-only focus/blur, pointer drag-select, wheel, select-all + copy via `getRichTextCharIndexAtPoint`.

**Clipboard decoupling (Bronze, this session — verified).** Both managers' `navigator.clipboard?.writeText` calls are gone. `dispatchTextInputKeyDown` and `dispatchSelectableRichTextKeyDown` take an optional `onCopy?: (text: string) => void`; the copy/cut paths fire the callback instead of touching a browser global. This removes the platform-coupling leak the prior depth review flagged.

## Gaps

The dominant gap is a build/wiring breakage, not a missing feature. Listed worst-first.

- **The package does not compile (critical).** `67dc46d64:textInputEditing.ts` calls `recordTextInputEdit` (line ~461), `applyHistoryRecord` (lines ~413, ~560), `getCaretLineIndex` (lines ~355, ~371), `getLineStartIndex` (line ~372), and `getLineEndIndex` (line ~356). None of the five is defined as a `function`/`const`, and none is imported — verified by an exhaustive grep over `src/`. `undoTextInput`/`redoTextInput`/`moveTextInputCaretToLineStart`/`ToLineEnd` and the history-recording branch of `replaceTextInput` all depend on these missing functions, so a `tsc -b` over this package fails. (`replaceTextInput` is on the _tested_ path, so even existing tests cannot pass against this source.)
- **Silver functions are not exported from the barrel.** `index.ts` was modified this session (committed) but still lists only the 26 Bronze functions; `undoTextInput`, `redoTextInput`, `canUndoTextInput`, `canRedoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineStart`, `moveTextInputCaretToLineEnd`, and `scrollTextInputCaretIntoView` are unreachable from `@flighthq/textinput`'s public surface even if they compiled. `exports:check` would also fail: these exported functions have no colocated tests (see below).
- **`dist/` is stale.** `dist/index.d.ts` and `dist/textInputEditing.d.ts` declare 26 functions, omit every Silver addition, and `dist/textInputEditing.js` contains no `setRichTextScrollH` import or `recordTextInputEdit`/`undoTextInput` reference. The realized public-API artifact predates the committed source edits — consistent with the source never having built successfully after the Silver edits landed.
- **No tests for the Silver surface.** `textInputEditing.test.ts` describe blocks cover only the 26 Bronze functions; there is no `describe('undoTextInput')`, `redoTextInput`, line-relative, or `scrollTextInputCaretIntoView` block (grep count 0). The undo/line/scroll code is entirely unexercised.
- **Two selection models persist.** The editable path uses `TextInputState.caretIndex/selectionIndex`; `SelectableRichTextManager` uses `runtime.selectionBeginIndex/selectionEndIndex` on `RichTextRuntime`. Two representations of "a selected range," with `SelectableRichTextManager` reimplementing select-all/copy/hit-test independently. A depth/consistency smell the prior review and the status doc both name; unification is parked as a design decision (see Open directions).
- **IME / composition absent.** No `TextInputComposition`, no marked-text lifecycle. The single largest _feature_ gap for a from-scratch input core that renders its own caret (CJK / mobile).
- **Grapheme-cluster + bidi correctness absent.** Caret motion, deletion, and hit-testing index in UTF-16 code units; no extended-grapheme-cluster boundaries (emoji/ZWJ/combining marks) and no bidi/RTL-aware caret or selection. Both depend on `@flighthq/textlayout` exposing the needed data.
- **Drag-select auto-scroll absent.** `scrollTextInputCaretIntoView` covers caret-into-view (once it compiles), but a pointer-move drag that leaves the field bounds does not advance scroll toward the pointer; the pointer-move dispatchers take no viewport-bounds argument.
- **No restrict/maxChars feedback.** A rejected/truncated insert is dropped silently; no result or signal a UI could flash/beep on.
- **No selection-changed / edit signals.** No `enableTextInputSignals` opt-in group, so app code must poll for caret/selection/text changes.
- **Performance is O(text-length) per keystroke.** `replaceTextInput` rebuilds the whole string and rescans format ranges every edit; no rope/gap-buffer. Acceptable for now, behind stable signatures.

## Charter contradictions

The charter is a `draft`/stub: only "What it is" is filled (and the code matches it — caret/selection model, edit/delete/replace, restrictions, password masking, focus/dispatch managers over a `RichText` runtime slot, plus the editable + read-only modes). North star, Boundaries, Decisions, and Open directions are all `TODO`, so there is no blessed rule to contradict. The honest finding is therefore not a charter contradiction but a **status-doc contradiction**: the worker's status claims undo/redo, line-relative Home/End, and caret-scroll are _deferred_, while the committed source contains all three (broken and unwired). The continuity log is wrong about what is in the tree — exactly the kind of claim the review-verify pass exists to catch. The two-selection-model "deferred" claim is accurate; the three "deferred features" claims are not.

## Contract & docs fit

**Lives up to the contract (design level):** full unabbreviated names throughout (`getTextInputCharacterIndexAtPoint`, `moveTextInputCaretToLineStart`, never abbreviated); `get*`/`has*`/`is*` prefixes correct; out-param geometry (`getTextInputCaretRectangle`, `getTextInputSelectionRectangles`) writes into `out` first arg and reuses a module-bottom `scratchRect` for vertical navigation (no per-keystroke allocation); editing functions allocate nothing visible; `getInputState` _throws_ on a not-enabled `RichText` (documented as API misuse — consistent with "throw only for programmer error"), while expected-failure paths return sentinels (`getSelectableRichTextSelectionText` → `''`, `getTextLayoutGroupAtIndex` → `null`). Types are header-first in `@flighthq/types` and complete: `TextInputState` (with `history`/`historyIndex`/`historyLimit`/ `desiredCaretX`/`caretColor`/`caretWidth`), `TextInputEditRecord`, `TextInputEditingOptions` (`ReplaceTextInputOptions` with `mergeKind`/`skipHistory`/`applyInputRules`, `HandleTextInputKeyboardOptions` with `layout`), all exported from the types barrel. `package.json` is `sideEffects: false`, single `.` export. The clipboard decoupling removes the one prior platform-coupling defect. `crate: flighthq-textinput` mirror is named in the charter front matter.

**Defects / candidate revisions:**

- **Broken build = contract violation at the most basic level.** The package must `tsc -b` and pass `npm run check`/`exports:check`. With five undefined helpers and eight unexported-but-`export`ed functions, it does neither. This is the finding that gates everything else — no other contract point matters until the source compiles, the helpers are written, the barrel is updated, `dist/` is rebuilt, and the Silver functions get colocated tests.
- **`package.json` dependency drift.** `dependencies` lists `displayobject`, `node`, `signals`, `text`, `textlayout`, `types`. The source imports `@flighthq/node`, `@flighthq/text`, `@flighthq/textlayout`, `@flighthq/signals`, `@flighthq/types` — but **not** `@flighthq/displayobject` (no import in any of the five source files), and `@flighthq/input`'s types (`InputKeyboardData`, `InputTextData`, `TextInputSource`) are consumed via `@flighthq/types` re-exports rather than a direct `@flighthq/input` dependency. `displayobject` looks like a stale dependency `packages:check` should flag; confirm and drop if truly unused.
- **`TextInputState.ts` holds two exported interfaces** (`TextInputState` + `TextInputOptions`), against the types-layout one-concept-per-file convention (filename = type name). This is a defensible cohesion pairing (options are the authoring subset of the state), but it is a deviation worth a ruling by the types-layout owner — candidate revision, not a defect in `textinput`.
- **Package Map line is accurate but thin.** `index.md` says only "supports user input editing within a text primitive." Given the breadth actually present (or designed), the line under-describes the package, but it is not _wrong_. Low-priority candidate revision.

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** What is the durable bar? Likely: a single unified selection/caret model; pure free-function editing over a `RichText` runtime slot with no host coupling in the core; index semantics (code-unit vs grapheme) stated and held consistent across TS and the Rust crate.
2. **One manager + `readOnly`, or two entry points?** Whether to collapse `SelectableRichTextManager` onto `TextInputState` (a `readOnly: boolean`) so "selectable" is a subset of "editable" and one selection/caret/copy path serves both — or keep the two managers. The two-selection-model smell hinges on this. Pre-release means no migration cost.
3. **IME posture.** Build the `TextInputComposition` seam now (cross-package: `@flighthq/types`, `@flighthq/input` event wiring, `displayobject-*` marked-text rendering) or record it as deliberately deferred with the functional gap documented in source.
4. **Index-semantics contract.** Code-unit vs extended-grapheme-cluster indexing, decided once and mirrored in `flighthq-textinput`, before grapheme/bidi work — a divergence here would break Rust↔TS conformance.
5. **Clipboard default placement.** Where the default web clipboard lives now that the core is `onCopy`-only: an examples/app-layer `createWebTextInputClipboard()` helper, or wiring the manager to `@flighthq/clipboard`'s backend seam. The core staying pure is the lean choice; confirm.
6. **`textinput-formats` neighbor.** Whether masked/numeric/date/credit-card formatters justify a `-formats` neighbor (triad pattern) layered above `restrict`, and the formatter-seam shape.
7. **Accessibility descriptor.** Whether `textinput` owns a platform-neutral AT descriptor (data in `@flighthq/types`, consumed by a host backend) for screen-reader mirroring.

## Notes for status verification (as-claimed → verified)

The status doc is **partly inaccurate** and must not be taken at face value:

- **Confirmed:** the five Bronze functions exist, are exported, and are tested (word motion, word delete, vertical nav); the clipboard decoupling is real (`navigator.clipboard` gone, `onCopy` added); the `desiredCaretX`/`caretColor`/`caretWidth`/history fields are in `@flighthq/types`; the two-selection-model smell is real (managers vs `TextInputState`).
- **Contradicted:** undo/redo, line-relative Home/End, and caret-scroll-into-view are described as _deferred to a follow-up session_, but they are **committed in the source** (in `committed.patch`, not the working split) — as non-compiling, unexported code. The "Estimated new score: 84/100" and "all 105 passing" claims cannot hold against a source tree that does not build. Treat the status's deferred-items list as unreliable for this package; the source is the authority and it is broken.
