---
package: '@flighthq/textinput'
updated: 2026-06-24
basedOn: ./review.md
---

# textinput — Assessment

Sorted from `review.md` (score `partial — 58`). This package is a **broken intermediate**: the design and types for word/vertical motion (Bronze), undo/redo, line-relative Home/End, and caret-scroll-into-view (Silver) are all present, but the committed source does not compile (five undefined helpers), the Silver functions are not exported from the barrel, `dist/` is stale, and the Silver surface has no tests. That makes `Recommended` unusually large _and_ unusually safe: the work is finishing what is already in the tree — within `@flighthq/textinput`, no cross-package coupling, no new design decision. The genuine design forks (selection-model unification, IME posture, index semantics, formatter neighbor) stay parked in Backlog and route to the charter's Open directions. The prior `reviews/maturation/depth/textinput.md` Bronze/Silver/Gold roadmap is absorbed here and can be removed once this lands.

## Recommended

Strictly sweep-safe: within `@flighthq/textinput`, no cross-package coupling, no breaking change, no open design decision. Items 1–4 are a single coherent "make the committed Silver work actually build, ship, and be tested" repair and should be done together.

- **Define the five missing helper functions** so `textInputEditing.ts` compiles. `recordTextInputEdit` (append/coalesce a `TextInputEditRecord` onto `state.history` honoring `historyLimit` and `mergeKind`), `applyHistoryRecord` (set text + caret/selection from a record and invalidate), `getCaretLineIndex` (caret index → line index via the existing layout-group scan), `getLineStartIndex` / `getLineEndIndex` (line index → first/last char index, reusing `selectLineAtTextInputIndex`'s `\n`-scan logic). The callers (`undoTextInput`, `redoTextInput`, `replaceTextInput`'s record branch, `moveTextInputCaretToLineStart`/`ToLineEnd`) already exist and pin the exact signatures. Pure in-package — these are private helpers in the same file. — review.md (Gaps: "does not compile").

- **Export the Silver functions from the barrel.** Add `undoTextInput`, `redoTextInput`, `canUndoTextInput`, `canRedoTextInput`, `clearTextInputHistory`, `moveTextInputCaretToLineStart`, `moveTextInputCaretToLineEnd`, and `scrollTextInputCaretIntoView` to `index.ts` (kept alphabetized). They are already `export function` in `textInputEditing.ts` but unreachable from `@flighthq/textinput`. Run `npm run order:fix` after. — review.md (Gaps: "not exported from the barrel").

- **Add colocated tests for the Silver surface** so `exports:check` passes and the behavior is pinned: `describe` blocks for `undoTextInput`/`redoTextInput`/`canUndoTextInput`/`canRedoTextInput`/ `clearTextInputHistory` (record → undo → redo round-trip, coalescing by `mergeKind`, `historyLimit` bound, `clearTextInputHistory`), `moveTextInputCaretToLineStart`/`ToLineEnd` (multiline first/last line + layout-null fallback), and `scrollTextInputCaretIntoView`. Include the alias-safe and layout-null cases the Bronze tests already model. — review.md (Gaps: "No tests for the Silver surface").

- **Rebuild `dist/` and re-run `npm run check`.** Once the source compiles and the barrel is updated, the captured `dist/*.d.ts`/`.js` must be regenerated so the realized public API matches source; the current `dist/` declares only the 26 Bronze functions. — review.md (Gaps: "`dist/` is stale").

- **Drop the stale `@flighthq/displayobject` dependency** from `package.json` (no source file imports it; `@flighthq/input` types arrive via `@flighthq/types` re-exports). Confirm with `npm run packages:check`, then remove if unused. Within-package manifest hygiene. — review.md (Contract & docs fit, dependency drift).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Unify the two selection models** (`SelectableRichTextManager`'s `runtime.selectionBeginIndex/EndIndex` onto `TextInputState.caretIndex/selectionIndex`, via a `readOnly: boolean`). **Parked:** the one-manager-vs-two-entry-points choice is an explicit API-shape design decision and touches `@flighthq/types`. Routed to Open directions.

- **Selection-changed / edit signals** (`enableTextInputSignals` → `onTextInputChange`/`CaretMove`/ `SelectionChange` via `@flighthq/signals`). **Parked:** low effort but should reflect the _unified_ selection model, so it waits on the unification decision above.

- **Drag-select auto-scroll** (advance scroll when a pointer-move drag leaves the field bounds; a viewport-bounds argument on the pointer-move dispatchers). **Parked:** a real API-signature addition to the dispatchers and naturally pairs with the now-present `scrollTextInputCaretIntoView`; larger than the compile-and-wire sweep and benefits from a deliberate viewport-bounds API choice.

- **`maxChars` / restrict rejection feedback** (return a result or signal on a dropped/truncated insert). **Parked:** an API-shape choice (result value vs signal) that ties into the signals decision; not a pure sweep.

- **IME / composition seam** (`TextInputComposition` in `@flighthq/types`, lifecycle functions, `@flighthq/input` `compositionstart`/`update`/`end` wiring, `displayobject-*` marked-text rendering). **Parked:** cross-package and gated on an explicit IME-posture decision (build vs document-as-deferred). The single largest feature gap. Routed to Open directions.

- **Grapheme-cluster + bidi correctness** (cluster-boundary caret/delete/hit-test; visual-order motion and selection). **Parked:** depends on `@flighthq/textlayout` exposing grapheme boundaries and bidi runs, and requires a TS↔Rust index-semantics contract decided up front. Routed to Open directions.

- **`@flighthq/textinput-formats` neighbor + formatter seam** (registerable `TextInputFormatter`, number/currency/date/credit-card masks). **Parked:** new package via the triad `-formats` pattern; needs `npm run packages:check` and a seam design — runs the bedrock/plurality test. Routed to Open directions.

- **Accessibility descriptor** (platform-neutral AT descriptor: role/value/selection/editable). **Parked:** data in `@flighthq/types`, consumed by a host backend — cross-package.

- **On-screen-keyboard bridge** to `@flighthq/keyboard` (`SoftKeyboard`) on focus/blur. **Parked:** cross-package.

- **Performance rope/gap-buffer** (replace the O(text-length) string rebuild + format-range rescan per keystroke). **Parked:** larger than a sweep and affects the Rust `flighthq-textinput` mirror's representation, though it sits behind the current public signatures so it can land last without churn.

- **Split `TextInputOptions` out of `TextInputState.ts`** (types-layout one-concept-per-file). **Parked:** the file lives in `@flighthq/types`; a candidate revision for the types-layout owner, not within `textinput`. The pairing is a defensible cohesion exception.

- **Rust parity for the Silver additions + a `flighthq-functional` conformance scene** (type → select → word-motion → undo/redo → line/scroll). **Parked:** belongs to the Rust port worktree (`flighthq-textinput`); track per-tier as TS lands rather than batching, but it is out of this package's sweep.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). These are the design forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar (a single unified selection/caret model; pure free-function editing with no host coupling in the core; stated index semantics held across TS and Rust).
2. **One manager + `readOnly`, or two entry points** — resolve the two-selection-model smell; gates the signals work too.
3. **IME posture** — build the `TextInputComposition` seam now (cross-package) or document as deferred.
4. **Index-semantics contract** — code-unit vs extended-grapheme-cluster, decided once and mirrored in `flighthq-textinput` before any grapheme/bidi work (a divergence breaks conformance).
5. **Clipboard default placement** — an examples/app-layer `createWebTextInputClipboard()` helper vs wiring the manager to `@flighthq/clipboard`'s backend seam (core stays `onCopy`-only either way).
6. **`textinput-formats` neighbor** — approve/deny the masked/numeric/date formatter neighbor and the `TextInputFormatter` seam (runs the bedrock/plurality test).
7. **Accessibility descriptor ownership** — does `textinput` own the AT descriptor data?
