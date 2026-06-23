# Depth Review: @flighthq/textlayout

**Domain**

Renderer-agnostic text layout: turn a styled string (plain text, multi-format ranges, or HTML/CSS) plus a width into positioned glyph runs ("layout groups") with per-line metrics, then answer the queries an editable text field needs — hit testing, caret/selection geometry, scroll metrics, line/paragraph navigation. This is the line-breaking + positioning + measurement spine that sits _above_ a shaper (`@flighthq/textshaper`, an explicit dependency) and _below_ the text display objects (`TextLabel`/`RichText`). Comparable scope: the layout half of OpenFL's `TextEngine`/`TextField`, Pango/Cairo layout, DirectWrite `IDWriteTextLayout`, or the positioning layer of a browser inline formatting context.

**Verdict: solid — 66/100**

A genuinely capable Flash/OpenFL-grade text layout engine with real depth in the areas a TextField needs: multi-format runs, word wrap with long-word breaking, HTML+CSS+stylesheet parsing, kerning-aware pair measurement, tab stops, margins/indents, alignment, password masking, and a full battery of field queries (hit test, selection rects, line metrics, scroll math). It is well past a stub. It falls short of _authoritative_ on the modern-typography axis: no bidirectional text, no script/Unicode segmentation, no justification, no vertical/RTL layout, and grapheme/codepoint handling is UTF-16-naive. Much of that is correctly delegated to the shaper seam, but the layout-owned parts (bidi reordering, justification, true grapheme clustering, Unicode line breaking) are absent and would be required for an authoritative international text engine.

## Present capabilities

Core layout (`textLayout.ts`, `computeTextLayout`):

- Multi-format-range layout: a span crossing a `TextFormatRange` boundary correctly emits multiple `TextLayoutGroup`s with per-group format, ascent/descent/leading, and per-character `positions`.
- Word wrap (`wordWrap`) with greedy space-based breaking, trailing-space trim on wrap, leading-space skip on the wrapped line, and a long-word breaker (`breakLongWord`) that splits a single word wider than the wrap width (always placing ≥1 char).
- Multiline vs single-line (`multiline`) line-break handling over `\n`/`\r`.
- Paragraph model: per-paragraph `leftMargin`/`rightMargin`/`blockIndent`/`indent`, first-line indent, recomputed at each paragraph start.
- Kerning via pair-wise measurement (`measure(pair) - measure(next)`), `letterSpacing`, and tab stops (explicit `tabStops` list or default 4-space grid via `getTabAdvance`).
- Mixed-format line metrics: `commitLine` back-patches max ascent/height across all groups on a line.
- Alignment pass (`applyAlignment`): left/right/center line shifting (note: `justify`/`start`/`end` accepted by the type but not implemented).
- Line-metric arrays on the result: `lineAscents/lineDescents/lineHeights/lineLeadings/lineWidths`, `numLines`, `textWidth`, `textHeight`, with a 2px gutter convention.

Rich text content build (`richTextContent.ts`, `computeRichTextContent`):

- HTML subset parser: `b/strong`, `i/em`, `u`, `s/strike`, `a` (href/target), `p` (align), `li` (bullet), `br`, `font` (face/size/color/...), `textformat` (Flash `<textformat>` attributes), with a tag/format stack.
- Inline CSS (`style="..."`) and a `StyleSheet` map (tag, `.class`, `#id` selectors) via `applyCssFormat`/`applyStyleSheetFormat`.
- HTML entity decoding (named + decimal + hex), `condenseWhite`, `maxChars` clamping, `defaultTextFormat`/`textFormat`/`textColor` base merge, named/hex/short-hex/`0x` color parsing, `textFormatRanges` overrides with range splitting/merging.
- Password masking (`passwordCharacter`, bullet default) sourced from the input capability.

Field queries (`richTextQuery.ts`): `getRichTextCharIndexAtPoint`, `getRichTextCharBoundaries`, `getRichTextSelectionRectangles`, `getRichTextLineIndexAtPoint`/`OfChar`, `getRichTextLineLength`/`Text`/`Offset`/`Metrics`, `getRichTextFirstCharInParagraph`, `getRichTextParagraphLength`, `getRichTextLinkAtPoint`. These cover the OpenFL `TextField` query surface well.

Metrics & bounds: `richTextMetrics.ts` (scroll math: `maxScrollV/H`, `bottomScrollV`, `scrollYOffset`, visible-line count, text width/height), `textBounds.ts` (autoSize box sizing: width/height/offsetX/rectangle for none/left/right/center), `textMetrics.ts`, `textFormat.ts` (ascent/descent/leading/height defaults + `mergeTextFormat`), `textLineBreaks.ts`, plus the measure seam (`textLayoutMeasure.ts`) and runtime caches (`textLayoutRuntime.ts`, `getRichTextContent`).

Architecture is clean and on-style: free functions, `out`-param results, runtime-slot caches, `Readonly<>` inputs, shaping pushed behind `getTextLayoutMeasureProvider`/the `textshaper` backend with an injection escape hatch.

## Gaps vs an authoritative text-layout library

Missing-by-design (delegated, correctly):

- **Glyph shaping / font metrics**: advances come from the injected `TextMeasureFunction` / `textshaper` seam. The engine's "ascent/descent" are crude size-ratio constants (`size`, `size*0.185`) rather than real font metrics — acceptable only because true metrics are meant to arrive through the shaper. This is the intended boundary.

Missing-by-omission (would be expected in an authoritative engine, and are layout-owned, not shaper-owned):

- **Bidirectional text (UBA)**: no `unicode-bidi`-style level resolution or visual reordering. Layout is strictly left-to-right by character order; RTL (Arabic/Hebrew) and mixed-direction lines will be wrong even with a shaper. The Rust port doc explicitly lists `unicode-bidi` as part of the canonical stack — its absence here is a real gap.
- **Unicode line breaking (UAX #14)**: breaking is naive — wraps only on U+0020 spaces (`text.indexOf(' ')`). No break opportunities at hyphens, tabs, CJK characters (which have no spaces and would never wrap), non-breaking space suppression, or the `\f`/zero-width classes. No hyphenation.
- **Grapheme clustering (UAX #29)**: `charAt`/`substr`/`charAt(i+1)` operate on UTF-16 code units. Surrogate pairs (emoji, astral scripts) and combining marks are split, mis-measured, and mis-caret-positioned. An authoritative engine clusters before measuring/caret placement.
- **Justification**: `align: 'justify'` is in the type and accepted by the HTML/CSS parsers but never applied (`applyAlignment` only handles left/right/center). No inter-word/inter-character stretch.
- **`start`/`end` alignment**: accepted as values but treated as left (no direction-relative resolution — coupled to the missing bidi support).
- **Vertical writing modes**: no `tb`/vertical layout, no `writing-mode` notion. (Arguably out of scope for an OpenFL-target engine, but expected of a fully authoritative one.)
- **Tab alignment variants**: only left tab stops; no center/right/decimal tab alignment.
- **Per-format `kerning`/`leading` line-height modes**: `TextFormat.kerning` boolean exists but is ignored (kerning is always on via pair measurement); leading is treated as additive only.
- **Ellipsis / truncation / max-lines clipping**: no overflow truncation ("…") — a common field requirement.
- **Bullets/list rendering**: `<li>` sets `format.bullet` but there is no bullet glyph emission, indent, or numbering — it is a flag with no layout effect.
- **`<img>` / inline objects / inline graphics**: no support for embedded inline non-text runs.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `getRichText*` for field queries, `computeTextBounds*` for sizing, `getTextFormat*` for metrics — matches the project's "full unabbreviated type word" rule. Good.
- `computeTextLayout(out, params)` taking the `measure` function inside `params` (rather than the registered provider) is a clean, testable seam; the provider indirection lives one layer up. Reasonable split.
- `getTextLineBreakIndex(lineBreaks, startIndex)` does a linear scan of a sorted array — fine for typical line counts, but it is O(n) where a binary search is the idiomatic choice; minor.
- `getRichTextCharBoundaries`/`getRichTextCharIndexAtPoint` accept a `text` parameter that is unused in the boundaries path (the layout already carries indices) — harmless but slightly misleading signature.
- The `bullet`/`kerning`/`justify`/`start`/`end` cases that parse-but-don't-apply are a quiet API-honesty gap: the type advertises capabilities the engine silently drops. Either implement or document as unsupported.
- The 2px `GUTTER`/`TEXT_BOUNDS_GUTTER` constant is duplicated across `textLayout.ts` and `textBounds.ts`; a single shared constant would prevent drift.

## Recommendation

Treat this as **solid, not authoritative**. It is a faithful, well-structured OpenFL-class layout engine and is more than adequate for the SDK's immediate Flash-compatibility target. To reach AAA/authoritative for the _text layout_ domain, the priority gaps are the layout-owned Unicode concerns the shaper cannot supply: (1) Unicode line breaking (UAX #14) so non-space scripts and break-class rules work, (2) grapheme clustering (UAX #29) so surrogate pairs/combining marks measure and caret correctly, and (3) bidi reordering (UBA) so RTL and mixed-direction text lay out — this also unlocks `start`/`end` alignment. Then close the smaller, already-typed gaps: implement `justify`, real `<li>` bullets, ellipsis/truncation, and decimal/center/right tab stops. The shaping delegation to `@flighthq/textshaper` is the right boundary and should stay; the missing pieces above are squarely this package's responsibility.
