---
package: '@flighthq/textlayout'
status: solid
score: 68
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/textlayout.md
  - source
  - changes.patch
  - charter.md
---

# textlayout — Review

Evidence: `incoming/builder-67dc46d64/head/packages/textlayout/` + `changes.patch`. Findings reference `67dc46d64:<path>`. The prior depth review (`reviews/depth/textlayout.md`) and maturation roadmap (`reviews/maturation/depth/textlayout.md`) both still exist and are absorbed here; this survey supersedes them. The charter is a pure stub (every body section is `_TODO_`), so most of "what good means here" falls back to the codebase-map AAA standard and is flagged as candidate Open directions.

## Verdict

`solid — 68/100`. A faithful, well-structured OpenFL-class layout spine — multi-format runs, word wrap with long-word breaking, HTML/CSS/stylesheet parsing, kerning-aware pair measurement, tab stops, margins/indents, the full TextField query surface — that this diff pushed measurably forward on the _API-honesty_ axis: the Bronze-tier "typed-but-dropped" gaps (`justify`, `start`/`end`, `<li>` bullets, ellipsis/truncation, the `kerning` flag) are now implemented, codepoint iteration replaces UTF-16-naive `charAt`, and the duplicated gutter constant is unified. It is still short of _authoritative_ on the modern-typography axis the depth review named — no bidi, no Unicode line breaking (UAX #14), no real grapheme clustering (UAX #29), crude ratio-based font metrics — and most of that is correctly gated behind a cross-package shaper-seam widening that has not happened. The 68 (below the worker's self-estimated 78) reflects this review's distance-to-authoritative bar plus two stale-status findings, one genuinely-incomplete justification model, and one untested wrap×truncation interaction. The code is good and the diff is real progress; the score grades the gap to AAA, not the diff.

## Present capabilities (verified against source)

**Core layout** (`textLayout.ts`, `computeTextLayout` → `out: TextLayoutResult`). Multi-format-range placement (`placeSpan` emits a fresh `TextLayoutGroup` per format-range crossing, with per-group ascent/descent/leading and per-codepoint `positions`); greedy space-based word wrap with trailing- space trim on wrap and leading-space skip on the wrapped line; a long-word breaker (`breakLongWord`) that always places ≥1 codepoint; multiline `\n`/`\r` handling; a per-paragraph model (`leftMargin`/`rightMargin`/`blockIndent`/`indent`, first-line indent, recomputed at each paragraph start via `updateParagraphMetrics`); mixed-format line metrics back-patched in `commitLine`. Empty input is handled by an early reset. Confirmed against `textLayout.test.ts` (44 `it`s).

**Bronze-tier additions landed this diff** (all verified present and exported):

- **`justify`** — `justifyLines` distributes residual line width across inter-word gaps for non-last lines. The last line of _each paragraph_ is correctly excluded via a `_paragraphLastLines: Set<number>` populated at every `\n` commit (`textLayout.ts:503`) and at end-of-text (`textLayout.ts:572`) — i.e. the proper paragraph-boundary tracking, **not** the `li === lineCount - 1` whole-layout heuristic the status doc still describes as a live concern (see Status verification below).
- **`start`/`end` alignment** — `applyAlignment` resolves `'start'`→`'left'`/`'end'`→`'right'` under LTR and reverses under RTL, driven by a new `direction?: TextDirection` param (default `'ltr'`).
- **Ellipsis / truncation** — `maxLines`/`truncationCharacter` (default `'…'`) on `TextLayoutParams`; `checkTruncation` fires after `commitLine`, trims the last group to fit, and appends a synthetic ellipsis group assigned to `lineIndex - 1`. `getTextLayoutIsTruncated(layout, params): boolean` is the exported query.
- **`<li>` bullets** — `emitBullet` emits a real `•` group at the hanging-indent position before a list-item paragraph, auto-computing a positive `indent` when none is set; honors `format.listMarker === 'none'` to suppress the glyph while keeping the indent.
- **`kerning` flag** — `charAdvances` checks `format.kerning !== false` before doing pair-difference measurement; `false` uses single-glyph advances.
- **Codepoint-aware iteration** — `charAdvances` and `breakLongWord` step by `codePointAt` + `slice` (`charLen = cp > 0xffff ? 2 : 1`), so surrogate pairs are not split (codepoint-level, not yet UAX #29).

**Rich-text content build** (`richTextContent.ts`, `computeRichTextContent`). HTML subset parser (`b/strong`, `i/em`, `u`, `s/strike`, `a`, `p`, `li`, `br`, `font`, `textformat`) with a tag/format stack; inline CSS (`applyCssFormat`) and a `StyleSheet` map (tag/`.class`/`#id` via `applyStyleSheetFormat`); HTML entity decoding (named/decimal/hex), `condenseWhite`, `maxChars` clamping, named/hex/short-hex/`0x` color parsing; `textFormatRanges` overrides with range split/merge; password masking via `getRenderableSource`. Runtime cache pair (`createRichTextContent`/`getRichTextContent`/`clearRichTextContent`) over a `RichTextRuntime` slot.

**Field queries** (`richTextQuery.ts`, 12 exported `getRichText*`): `getRichTextCharIndexAtPoint`, `getRichTextCharBoundaries`, `getRichTextSelectionRectangles`, `getRichTextLineIndexAtPoint`/`OfChar`, `getRichTextLineLength`/`Text`/`Offset`/`Metrics`, `getRichTextFirstCharInParagraph`, `getRichTextParagraphLength`, `getRichTextLinkAtPoint`. Covers the OpenFL `TextField` query surface.

**Metrics & bounds.** `richTextMetrics.ts` (scroll math: `getRichTextMaxScrollV/H`, `BottomScrollV`, `ScrollYOffset`, visible-line count, text width/height); `textBounds.ts` (autoSize box sizing for none/left/right/center via `computeTextBounds{Height,OffsetX,Rectangle,Width}`); `textMetrics.ts`; `textFormat.ts` (ascent/descent/leading/height + `mergeTextFormat`); `textLineBreaks.ts`; the measure seam (`textLayoutMeasure.ts`); runtime caches (`textLayoutRuntime.ts`).

**Gutter unification.** `TEXT_LAYOUT_GUTTER = 2` is now the single source of truth in `textLayout.ts`; `TEXT_BOUNDS_GUTTER` in `textBounds.ts` is `= TEXT_LAYOUT_GUTTER` (a re-exported alias), removing the prior drift risk between the two files.

**Binary search.** `getTextLineBreakIndex` now binary-searches the sorted `lineBreaks` array (`textLineBreaks.ts:6-21`) instead of the prior O(n) linear scan; semantics preserved.

**Shaper seam.** `getTextLayoutMeasureProvider` returns the explicit injected provider if set, else `shapeText` from `@flighthq/textshaper` when a backend is registered, else `null` — the clean, testable measure boundary the depth review praised, unchanged.

**Architecture & packaging.** Free functions throughout, `out`-param results, runtime-slot caches, `Readonly<>` inputs. `package.json` is `sideEffects: false`, single `.` export, deps limited to `@flighthq/textshaper` + `@flighthq/types`. New cross-package types (`TextDirection`, `TextJustification`, `TextListMarker`, extended `TextLayoutParams`) are homed in `@flighthq/types`, per the header-layer rule. `crate: flighthq-textlayout` mirror is named in the charter front matter.

## Gaps (vs the authoritative text-layout target; charter silent, so codebase-map standard applies)

These are the same modern-typography gaps the depth review named; the Bronze diff closed the API-honesty subset but left the algorithmic core untouched. All are **layout-owned** (not shaper- delegated) except where noted.

- **No bidirectional text (UBA / UAX #9).** Layout is strictly character-order LTR. `applyAlignment` resolves `start`/`end` against a _base_ direction but does no level resolution or visual reordering, so Arabic/Hebrew and mixed-direction lines lay out wrong even with a shaper. The Rust port doc names `unicode-bidi` as the canonical stack; its absence here is the single largest gap to authoritative.
- **No Unicode line breaking (UAX #14).** Wrapping keys off `text.indexOf(' ')` only. CJK (no spaces) never wraps; hyphens, `nbsp` suppression, `\f`/zero-width classes are all unhandled; no hyphenation.
- **Grapheme clustering is codepoint-level, not UAX #29.** This diff fixed surrogate-pair splitting, but combining marks, ZWJ emoji sequences, regional indicators, and Hangul are still split/mis- measured/mis-caret-positioned. Caret and selection step by codepoint, not extended grapheme cluster.
- **Crude font metrics.** `getTextFormatDescent` is `size * 0.185` and ascent is `size` (`textFormat.ts:5-11`) — ratio constants, not real font metrics. Acceptable only because real metrics are meant to arrive through the widened shaper seam (cross-package), which has not landed.
- **Justification model is inter-word-by-group-boundary, not by space count.** `justifyLines` distributes residual width over `lineGroups.length - 1` group boundaries (`textLayout.ts:650`), i.e. format-range boundaries, _not_ actual inter-word space count. A single-format justified line with multiple words but no format change has exactly one group → `spaceCount === 0` → no justification at all (`textLayout.ts:651`). The depth-review/roadmap intent ("distribute across inter-word spaces") is only partially realized: it stretches at format boundaries, not at every space. This is a correctness gap in the just-landed feature, not merely a missing one.
- **No `interCharacter` justification / Kashida.** `TextJustification` is `'interWord' | 'none'`; CJK character-level expansion and the Arabic Kashida seam are reserved for Silver.
- **Tab alignment is left-only.** No center/right/decimal tab stops (`getTabAdvance` resolves the first stop past `currentX` or a 4-space grid).
- **List markers are bullet-only.** `TextListMarker` is `'bullet' | 'none'`; `'decimal'`/`'lowerAlpha'`/ `'upperRoman'` ordered markers and nested-list depth are unimplemented.
- **No vertical writing modes, no inline objects/embedded runs.** No `tb`/vertical layout; no `<img>` or inline-placeholder participation in line breaking. (Arguably beyond the OpenFL target; expected of a fully authoritative engine.)
- **No conformance corpus / golden snapshots.** Layout output stability is asserted by hand-written unit cases only; there is no shared cross-impl oracle, which the Rust mirror will need.
- **No pooling / incremental relayout.** `computeTextLayout` rebuilds the whole layout each call; transient arrays (`_lineBreaks`, `_charAdvances`, per-group `positions`) are module scratch or fresh allocations, with no `acquire*`/`release*` and no `invalidateTextLayoutRange` for edit-time reflow.

## Charter contradictions

**None — the charter is a pure stub.** Every body section (`What it is`, `North star`, `Boundaries`, `Decisions`, `Open directions`) is `_TODO_`, so there is no blessed rule for the code to violate. This is the thin-charter case, not a failure: the entire "what good means here" surface is assumed from the codebase map and surfaced below as candidate Open directions. The one soft tension worth noting is that the package implements features (`justify`, bullets, truncation) whose _correctness bar_ the charter has never set — so e.g. the inter-word-by-group-boundary justification above cannot be judged "wrong against the charter," only "incomplete against the OpenFL/CSS standard the roadmap cites."

## Contract & docs fit

**Lives up to the contract:** full unabbreviated names (`computeTextLayout`, `getRichTextCharIndexAtPoint`, `getTextLayoutIsTruncated` — never abbreviated); `out`-param results (`computeTextLayout(out, …)`, `computeTextBoundsRectangle(out, …)`, `getRichTextSelectionRectangles(out, …)`); sentinel returns (`getRichTextLineMetrics` → `null`, `getRichTextLinkAtPoint` → `null`, `getTextLineBreakIndex` → `-1`, `getRichTextCharBoundaries` → `false`); types-first in `@flighthq/types` (all new kinds added there); single `.` export; `sideEffects: false`; no module-top side effects (the measure provider is a lazily-set module variable, set only by an explicit `setTextLayoutMeasureProvider`). Good contract hygiene overall.

**Defects / candidate revisions:**

- **`getRichTextCharBoundaries` / `getRichTextCharIndexAtPoint` carry a dead `_text` parameter.** Renamed to `_text` with JSDoc ("Unused … will be removed in a future breaking release"). This is an honest interim, but it is a _deliberately-shipped wrong signature_: the function advertises a `text` argument it never reads. Since Flight is pre-release with no compat obligation (codebase map: "rename it, restructure it, or remove it"), the contract direction is to drop the parameter now rather than carry a deprecation. Flagged as a candidate, not a blocker.
- **Stale status doc vs. code (justify last-line).** Status "Concerns #4" describes `justifyLines` as using a `li === lineCount - 1` heuristic that is "incorrect for multi-paragraph text." The shipped code already tracks per-paragraph last lines via `_paragraphLastLines` and skips all of them (`textLayout.ts:621-661`). The concern was _fixed in this same diff_ but the status text was not updated — a status-accuracy defect, not a code defect (see Status verification).
- **Status test count is off.** Status claims `120 → 137 tests`; the tree has **145** `it`s across 12 `*.test.ts` files (66 `describe` blocks). The direction (tests grew) is right; the number is stale. Minor.
- **`writeLineMetrics` / `getLineOffsetY` hardcode the gutter as a literal `2`.** `getLineOffsetY` (`richTextQuery.ts:237`) starts `y = 2` rather than referencing `TEXT_LAYOUT_GUTTER`. The diff unified the gutter constant across `textLayout.ts`/`textBounds.ts` but `richTextQuery.ts` still carries a bare literal — the exact drift the unification was meant to remove, just in a third file. In-package, sweep-safe.
- **No registry/union fork pressure (fork B).** Unlike `shape`, this package has no `switch(kind)` dispatch family — the format/HTML-tag handling is a closed parser, appropriate for a closed syntax (HTML subset), and the alignment/justification logic is a small fixed set. Fork B does not bite here; noting it explicitly so the assessment need not raise it.
- **Package Map line is accurate but thin.** "renderer-agnostic glyph layout for rich text composition" matches the code. The `text-shaping` Package Map entry (the widened seam) is the cross-package dependency this package's Silver tier is gated on; no revision needed to the textlayout line itself.

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** What is the durable bar? Likely: a renderer-agnostic, shaper-fed layout spine whose output is bit-deterministic across TS and the Rust `flighthq-textlayout` mirror, covering the full OpenFL `TextField` surface and (at Silver) correct international text. Confirm so future work — and the justification-correctness question below — is judged against something.
2. **Where the shaper boundary sits, and whether to widen it now.** Real font metrics, bidi positioning, ligatures, decimal tabs, and GPU/WebGPU text all require `shapeText(text, format): number` to become a cluster/advance/level-returning `ShapedGlyphRun` seam. This is the single biggest cross-package decision (touches `textshaper`, `textlayout`, `text`, `textinput`, and the Rust mirror) and gates most of Silver. The charter should record the agreed `ShapedGlyphRun` shape and whether width-only callers keep a fast path.
3. **`@flighthq/textlayout-formats` neighbor for the UAX #14/#29 tables.** The roadmap proposes shipping the line-break and grapheme tables in a `-formats` neighbor so the core tree-shakes for plain-LTR callers (the established triad pattern). Approve/deny, and decide vendored-vs-build-time-generated from the UCD (size/licensing tradeoff, verify with `npm run size`).
4. **Bidi algorithm choice — pin it to the Rust stack.** The Rust port names `unicode-bidi`. The TS implementation must use the same (or a bit-compatible) algorithm so Silver bidi output is bit-deterministic for the conformance corpus. Coordinate before any UBA work begins.
5. **Justification correctness target.** Is the current inter-word-_by-format-group-boundary_ model an accepted interim, or should it be re-grounded on actual inter-word space positions (so a single- format multi-word line justifies)? This is a correctness ruling the charter should make, since the feature shipped without a stated bar.
6. **`_text` parameter removal.** Pre-release license to drop the dead `text` argument from the two query functions now, rather than carry a deprecation — confirm the breaking change is welcome.
7. **Scope of vertical writing modes and inline objects.** Whether these (Gold) are in scope for an OpenFL-target SDK at all, or explicitly out-of-scope non-goals the charter can name.

## Status verification (as-claimed → verified)

The worker status doc is **mostly accurate but lags its own diff in two places**. Verified true: the Bronze additions all exist and are exported (`justify`, `start`/`end`, `maxLines`/truncation, `<li>` bullets, `kerning` flag, codepoint iteration, `TEXT_LAYOUT_GUTTER` unification, binary search); the new types are homed in `@flighthq/types`; the architecture/packaging claims hold; password masking and the measure seam are unchanged and correct. **Stale:** (a) Concern #4's "last-line justify is a `lineCount - 1` heuristic" — the code already does proper paragraph-boundary tracking via `_paragraphLastLines`; the concern was resolved in this diff. (b) The `120 → 137` test count — the tree has 145 `it`s. **Live and worth keeping:** Concern #1 (bullet overlap when `indent` is explicitly `0` and a large bullet glyph — `emitBullet` only auto-indents when `indent <= 0`), and Concern #2 (the `breakLongWord` truncation path and the main-loop truncation path are not tested together — a long word straddling the `maxLines` boundary is uncovered). The self-estimated 78 is optimistic against this review's distance-to-authoritative bar; the _inventory_ it claims is real and the diff is genuine forward motion.
