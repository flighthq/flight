---
package: '@flighthq/textlayout'
crate: flighthq-textlayout
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textlayout — Charter

## What it is

`@flighthq/textlayout` is the **renderer-agnostic text layout engine** — turns styled text (plain or HTML/CSS subset) into positioned glyph runs ("layout groups") with per-line metrics. Multi-format-range layout with word wrap and long-word breaking, HTML subset parser (b/i/u/s/a/p/li/br/font/textformat with inline CSS and stylesheets), kerning-aware pair measurement, tab stops, margins/indents, alignment (left/right/center/start/end/justify), bullet list emission, maxLines ellipsis truncation, codepoint-aware iteration, binary-search line breaks, scroll metrics (maxScrollV/H, bottomScrollV), autoSize bounds, TextField query surface (hit test, caret/selection rects, line metrics, paragraph navigation, link detection), password masking. ~37 exports, 14 source files, ~147 tests. Dependencies: `textshaper`, `types`.

Sits above `@flighthq/textshaper` (measurement seam) and below the text display objects (`TextLabel`/`RichText`).

## North star

1. **Renderer-agnostic layout.** The layout engine produces positioned runs and metrics. It does not render, does not touch DOM, and does not own fonts.
2. **Correctness over fidelity.** Get the fundamentals right (line breaking, alignment, truncation, hit test) before chasing typographic polish. Wrong justification is worse than no justification.
3. **Decomposed passes.** Layout is a pipeline: measure → break → position → align → truncate → justify. Each stage should be an identifiable pass, not config-gated branches inside one function.

## Boundaries

**In scope:**

- Multi-format-range layout: measure, line break, position.
- HTML subset parsing (b/i/u/s/a/p/li/br/font/textformat).
- Alignment, justification, truncation (maxLines + ellipsis).
- Bullet/list emission.
- Scroll metrics, autoSize bounds.
- TextField query surface: hit test, caret/selection rects, line metrics, link detection.
- Kerning-aware measurement (via shaper seam).

**Non-goals:**

- Text shaping (glyph selection, GSUB/GPOS) — `@flighthq/textshaper`.
- Font loading/management — `@flighthq/font`.
- Rendering positioned glyphs — renderer packages.
- Bidi visual reordering (UAX #9) — future; layout orchestrates, shaper/bidi module provides data.

## Decisions

- **[2026-07-02] ~~Missing types~~ — false alarm.** Types were already present and correctly defined in `@flighthq/types`. The depth review was based on stale state.

- **[2026-07-02] Decompose `buildGroups` into passes.** Truncation, bullet emission, and justify are currently config-gated branches inside one large function. These should extract into post-passes (like alignment already is), unless doing so would measurably hurt performance. The decomposition principle applies — complexity inside one function is a smell of missing primitives underneath.

  **Why:** Big functions are monoliths. Alignment is already a separate pass; truncation, bullets, and justify should follow the same pattern. Performance can be measured after extraction.

- **[2026-07-02] Fix justification model — bug.** Current model distributes space at group boundaries, not between words. Single-format justified text (the most common case) gets zero expansion. The fix is to count actual space characters within each group and distribute proportionally.

  **Why:** Every real text engine distributes space between words. The group-boundary model is a correctness bug, not a fidelity tradeoff.

- **[2026-07-02] Font metrics: tier-dependent, basic shaper provides approximations.** Crude ratio constants (`size`, `size * 0.185`) are acceptable as the basic shaper's approximation. A full shaper (HarfBuzz) provides real metrics. The layout engine should use whatever the shaper backend provides, falling back to approximations when real metrics are unavailable.

  **Why:** The basic (Canvas2D) shaper can only approximate font metrics. The full (HarfBuzz) shaper has access to real font tables. Layout should accept both levels of fidelity.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Vestigial `_text` parameter.** Several query functions accept a `text` parameter they no longer use. Drop now or keep for possible future need? Uncertain.

2. **Decomposition plan.** What post-passes does `buildGroups` split into? Candidates: truncation pass, bullet emission pass, and justify as a true inter-word pass (not the current group-boundary model). The extraction should be measured for performance impact.

3. **Modern typography axis.** UAX #14 line breaking, UAX #29 grapheme clustering, full bidi (UAX #9) — all gated behind shaper-seam widening. Long-term, not immediate.

4. **Package Map update.**
