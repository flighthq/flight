# Maturation Roadmap: @flighthq/textlayout

**Current verdict:** Solid — 66/100. A faithful, well-structured OpenFL-class layout engine (multi-format runs, word wrap, HTML/CSS, kerning-aware measure, tab stops, the full TextField query surface), but short of authoritative on the modern-typography axis: no bidi, no Unicode line breaking, UTF-16-naive grapheme handling, and several typed-but-unimplemented capabilities (`justify`, `start`/`end`, `<li>` bullets, decimal/center tabs).

The shaping/font-metrics boundary (`@flighthq/textshaper`) is correct and stays. Everything below is **layout-owned** work the shaper cannot supply. Note the `textshaper` seam currently exposes only `shapeText(text, format): number` (width). Several tiers below depend on widening that seam to return clusters/advances/levels; those cross-package items are called out in Sequencing.

## Bronze

The first genuinely useful step beyond OpenFL parity: fix correctness traps that silently produce wrong output today, and honor the capabilities the types already advertise (API-honesty). No new Unicode tables yet.

- **Grapheme-cluster iteration (codepoint-level minimum).** Replace `charAt(i)` / `substr(i, 2)` / `charAt(i + 1)` in `buildGroups`, `breakLongWord`, and the pair-kerning loop with codepoint-aware iteration (`String.prototype[Symbol.iterator]` / `codePointAt`), so surrogate pairs (emoji, astral scripts) are not split, mis-measured, or mis-caret-positioned. Add `iterateTextGraphemes(out: number[], text)` writing cluster-boundary char indices (codepoint-level for Bronze; UAX #29 in Silver). Wire `getRichTextCharBoundaries` / `getRichTextCharIndexAtPoint` to step by cluster, not code unit.
- **Implement `align: 'justify'`.** Extend `applyAlignment` to a `justifyLine` path: distribute residual width across inter-word gaps (space-stretch), last line of a paragraph left/start-aligned. Add `TextJustification` kind in `@flighthq/types` (`'none' | 'interWord'`, with `'interCharacter'` reserved for Silver). Removes the largest parse-but-drop gap.
- **Resolve `start`/`end` alignment.** Map `start`/`end` to left/right under an explicit paragraph base direction (`TextDirection = 'ltr' | 'rtl'`, default `ltr`) on `TextLayoutParams`/per-paragraph format. Honest resolution now; full bidi reordering arrives in Silver.
- **Ellipsis / truncation.** Add `maxLines` and `truncationCharacter` (default `'…'`) to `TextLayoutParams`; `computeTextLayout` clips overflow lines and appends the truncation glyph on the last visible line, measured to fit. Expose `getTextLayoutIsTruncated(layout): boolean`. A near-universal field requirement that is fully layout-owned.
- **`<li>` bullet emission.** Make the existing `format.bullet` flag produce a real bullet glyph + hanging indent in `computeTextLayout` (and `computeRichTextContent`), not a no-op. Add `TextListMarker` data (`bullet | decimal | none`) in `@flighthq/types`; Bronze ships `bullet` only.
- **De-duplicate `GUTTER`.** Export a single shared `TEXT_LAYOUT_GUTTER` constant consumed by `textLayout.ts` and `textBounds.ts` to prevent drift.
- **Binary search in `getTextLineBreakIndex`.** Replace the O(n) linear scan over the sorted `lineBreaks` array with a binary search.
- **Signature honesty.** Drop the unused `text` parameter from `getRichTextCharBoundaries` (indices already live on the layout), or document why it stays.
- **Per-format `kerning` flag honored.** When `TextFormat.kerning === false`, skip the pair-difference measurement and use single-glyph advances (today kerning is always on). Cheap, removes a silent-drop gap.

## Silver

Competitive with a good layout library (Pango/DirectWrite-class for the OpenFL feature set): correct international text, real Unicode segmentation, and the professional tab/justification edge cases. This is where the package becomes trustworthy for non-Latin content.

- **Unicode line breaking (UAX #14).** Add `getTextLineBreakOpportunities(out: TextBreakOpportunity[], text)` computing mandatory + allowed break classes (BK/CR/LF/NL mandatory; SP/hyphen/CJK ID/SY break opportunities; GL/WJ/ZW/nbsp suppression). Replace the `text.indexOf(' ')` greedy wrap with break-opportunity-driven wrapping so CJK (no spaces) wraps at all, hyphens break, and non-breaking spaces hold. Define `TextBreakClass` / `TextBreakOpportunity` in `@flighthq/types`. Ship the UAX #14 pair table as data in a **`@flighthq/textlayout-formats`** neighbor package (the parser/table pattern) so the core stays small and the table tree-shakes out for callers who only do plain LTR wrapping.
- **Grapheme clustering (UAX #29).** Upgrade `iterateTextGraphemes` from codepoint-level to full extended grapheme clusters (combining marks, ZWJ emoji sequences, regional indicators, Hangul). Table also in `-formats`. Caret/selection/hit-test now land on cluster boundaries.
- **Bidirectional layout (UBA / UAX #9).** Add `resolveTextBidiLevels(out: Uint8Array, text, baseDirection)` and `reorderTextLineVisually(out: number[], levels, lineStart, lineEnd)`. `computeTextLayout` resolves levels, segments runs by level + direction change, and emits layout groups in visual order with correct per-run x-positioning. This makes Arabic/Hebrew and mixed-direction lines correct, and makes the Bronze `start`/`end` resolution direction-accurate. The Rust port doc names `unicode-bidi` as canonical stack — match it. Add `TextDirection`/`TextBidiLevel` types to `@flighthq/types`.
- **Widen the shaper seam to clusters + advances (cross-package, `@flighthq/textshaper`).** Replace/augment `shapeText(text, format): number` with `shapeTextRun(out: ShapedGlyphRun, text, format, direction)` returning glyph ids, advances, offsets, and cluster→char map. `textlayout` consumes `Σ advances` for width but now positions per-glyph (required for RTL, ligatures, and GPU/WebGPU text). Keep a measure-only fallback. This is the single biggest cross-package dependency; coordinate with the textshaper roadmap.
- **Real font metrics through the seam.** Replace the crude `size` / `size * 0.185` ascent/descent constants in `textFormat.ts` with metrics from the shaper backend when available (ascent/descent/lineGap/x-height/cap-height), falling back to ratio constants only when the measure-only backend is in use. Add `getTextFormatLineGap` and a `TextFontMetrics` type.
- **Tab alignment variants.** Extend the tab-stop model from left-only to `left | center | right | decimal` (`TextTabAlignment` kind + `TextTabStop { position, alignment, decimalCharacter }` in `@flighthq/types`); `getTabAdvance` resolves alignment against the following run's measured width / decimal point.
- **Inter-character justification + Kashida hook.** Extend `justify` to `interCharacter` (CJK) and expose an `interClusterExpansion` path; reserve a Kashida-elongation seam for Arabic (filled when the full-glyph shaper lands).
- **Ordered/decimal list markers.** Complete `TextListMarker` with `decimal`/`lowerAlpha`/`upperRoman` numbering and nested-list indent depth in `computeRichTextContent` + `computeTextLayout`.
- **Hyphenation seam.** Add a swappable `TextHyphenationBackend` (`get*`/`set*`/`createWeb*`) consulted at break time for soft-hyphen insertion; default backend honors explicit U+00AD soft hyphens only (dictionary backends are a later/optional add). Type in `@flighthq/types`.
- **Tests for every new path.** Colocated `*.test.ts` covering bidi reorder (LTR/RTL/mixed), UAX #14 CJK + hyphen + nbsp, grapheme clusters (ZWJ emoji, combining marks), justify residual distribution, decimal tabs, and truncation — including aliased `out === input` cases per the project rule.

## Gold

Authoritative / AAA — the canonical OpenFL-superset text-layout reference, with the modern-typography corners closed, performance hardened, and 1:1 Rust parity.

- **Vertical & mixed writing modes.** Add `TextWritingMode = 'horizontalTb' | 'verticalRl' | 'verticalLr'` and `TextOrientation` in `@flighthq/types`; `computeTextLayout` lays out vertical runs (CJK), with `textBefore`/`textAfter` (block/inline) metrics replacing the implicit horizontal-only `textWidth`/`textHeight`. Caret/selection/hit-test generalized to the block axis.
- **Inline objects / embedded runs.** Support `<img>` and generic inline placeholders: `TextInlineObject { width, height, baseline, ascent, descent }` participating in line breaking, baseline alignment (`baseline | top | middle | bottom`), and hit testing. Layout groups gain an inline-object variant.
- **Full Unicode line-break + tailoring.** UAX #14 with line-break-strict/normal/loose tailoring, CSS `word-break`/`overflow-wrap`/`line-break` modes, and East-Asian width handling; UAX #29 word boundaries for double-click selection (`getRichTextWordBoundaries`).
- **Advanced justification.** Knuth–Plass-style optimal paragraph breaking as an opt-in `TextLineBreakStrategy = 'greedy' | 'optimal'`; full Arabic Kashida elongation and inter-script expansion priorities; `justify-content` last-line policy options.
- **Sub/superscript, leading modes, and baseline grid.** Honor `TextFormat` baseline shift, half-leading vs additive-leading modes, and an optional baseline-grid snap for multi-format lines.
- **Performance & allocation hardening.** Pooled `acquire*`/`release*` for transient run/break/level arrays (no per-line allocation in the hot path); incremental relayout (`invalidateTextLayoutRange`) so editing a TextField re-lays only affected paragraphs; binary-search everywhere over line/char index lookups; benchmark gate.
- **Exhaustive error/edge handling.** Sentinels (`-1`/`null`/`false`) for all out-of-range queries (already mostly present — make it total and tested); explicit handling of empty string, all-whitespace, lone surrogates, degenerate width (`<= GUTTER*2`), and zero-glyph fonts.
- **Conformance corpus.** A golden-file suite of layout snapshots (bidi, CJK wrap, emoji clusters, justify, tabs, truncation) shared as the cross-impl oracle.
- **1:1 Rust parity — `flighthq-textlayout`.** Mirror the full surface in the Rust crate, with the canonical stack from `rust/text.md`: `unicode-bidi` (UBA), a UAX #14/#29 segmenter, and the rustybuzz-backed shaper seam. Every TS function ↔ snake_case Rust free function; out-params as `&mut`; conformance scenes paired by name in `flighthq-functional`. The bidi/segmentation/justify algorithms must be bit-deterministic across TS and Rust (feed the conformance map).
- **Docs.** Domain doc for the layout pipeline (itemize → bidi → break → shape-via-seam → justify → align → position), the writing-mode/coordinate-space contract, and the shaper-seam boundary.

## Sequencing & effort

Recommended order, dependencies, and items to surface:

1. **Bronze first, in this order:** GUTTER de-dup + binary-search + signature/kerning honesty (hours each, no type changes) → codepoint-level grapheme iteration (correctness trap; medium) → `justify` + `start`/`end` + truncation + `<li>` bullets (each needs a small `@flighthq/types` addition first per the header-layer rule; medium). Bronze is self-contained — no other package must change except adding types. Land `TextJustification`, `TextDirection`, `TextListMarker`, `TextTabAlignment` skeletons in `@flighthq/types` up front so Silver extends rather than reshapes them.

2. **Silver is gated on two cross-package decisions — surface these before starting:**
   - **Shaper-seam widening** (`@flighthq/textshaper`): the current `shapeText → number` seam cannot express clusters/advances/levels needed for RTL, ligatures, decimal tabs, and real metrics. This is a joint design with the textshaper roadmap and likely the textinput/text packages downstream. **Decision to surface:** shape of `ShapedGlyphRun` and whether width-only callers keep a fast path. Do this before bidi/font-metrics work.
   - **`@flighthq/textlayout-formats` neighbor package** for the UAX #14/#29 tables (the established `-formats` pattern). Confirm the split keeps the core tree-shakable for plain-LTR callers. Low risk; follows precedent.

3. **Within Silver:** UAX #14 line breaking and UAX #29 clustering can land in parallel (both data-driven, both in `-formats`). Bidi (UBA) depends on direction types from Bronze and pairs with the shaper-seam widening (per-glyph positioning). Real font metrics depend on the widened seam. Tab variants and list numbering are independent and small. Bidi + UAX #14 + clustering are the high-effort core (each a multi-day algorithm + table); the rest is medium.

4. **Gold is the genuine frontier** and largely independent items: vertical writing modes and inline objects are each large (touch the layout coordinate model and every query function); optimal line breaking and performance hardening are self-contained; Rust parity is a parallel track that should mirror each TS algorithm as it stabilizes (don't port a moving target — port after Silver lands).

5. **Cross-package / design items to raise with the user before acting:**
   - Widening the `textshaper` seam (touches textshaper, textlayout, text, textinput, and the Rust mirror) — a design decision, not autonomous work.
   - Whether vertical writing modes are in scope for an OpenFL-target SDK (Gold-only; arguably beyond the Flash feature target).
   - Whether the `-formats` Unicode tables should be vendored or generated from the Unicode Character Database at build time (licensing/size tradeoff; verify with `npm run size`).
   - Bidi/segmentation must stay bit-identical to the Rust crate — coordinate the algorithm choice with `rust/text.md` (`unicode-bidi`) up front so TS and Rust don't diverge.
