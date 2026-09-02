---
package: '@flighthq/textlayout'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source (12 source files, 14 total with entry points)
  - tests (12 test files, 151 test cases)
  - types (TextLayout, TextFormat, TextFormatRange, TextMeasureFunction, TextMetrics,
    TextBoundsSpec, TextLineMetrics, TextSelectionRectangle, TextDirection, TextJustification,
    TextVerticalAlign, RichTextContent, RichTextData, RichTextRuntime, TextLabelRuntime,
    TextShaperBackend, FontVariation)
  - package.json
  - prior review (2026-07-30)
  - prior assessment (2026-07-30)
---

# textlayout -- Review

## Verdict

**Solid -- 78/100.** The package provides a broad renderer-agnostic text layout spine: multi-format
layout with word wrapping, long-word breaking, alignment (horizontal + vertical + directional),
inter-word and inter-character justification, bullet lists, maxLines truncation with ellipsis, tab
stops, margins/indents, scroll metrics, and a full TextField query surface. All 12 source files carry
colocated tests (151 test cases), all exported types live in `@flighthq/types`, the package is
side-effect-free, and the two-lane export structure is correctly configured. No code has changed since
2026-07-30; the status.md rewrite of 2026-08-08 accurately maps the live state.

The remaining distance is international typography (UAX #14 line breaking, UAX #29 grapheme
clustering, UAX #9 bidi), the charter-blessed `buildGroups` decomposition, source style violations
(structural divider comments), module-level mutable state affecting re-entrancy, the missing guard
module for the null-measure-provider sentinel, and a latent `textFormatEquals` shallow-comparison
issue with the `variations` field.

## Present capabilities

**Layout construction** (`computeTextLayout`): accepts styled text with format ranges, a measure
function, and a width/height container. Produces positioned `TextLayoutGroup` runs carrying UTF-16
source ranges, per-codepoint advance arrays, line indices, and per-line ascent/descent/leading/width
metrics. The function handles:
  - Multi-format-range layout with format merging across range boundaries
  - Word wrapping at U+0020 boundaries and character-level fallback for long words
  - Explicit line breaks (LF, CR) in multiline mode
  - Kerning-aware codepoint measurement via two-character pair lookups
  - Tab stops (position-based, advancing to the next stop or 4-space default)
  - Margins (left/right), blockIndent, and per-paragraph first-line indent
  - Bullet list emission with `listMarker: 'none'` suppression and hanging-indent positioning
  - Horizontal alignment: left, right, center, justify, plus direction-relative start/end
  - Vertical alignment: top, middle, bottom within fixed-height containers
  - Inter-word justification distributing residual space across U+0020 characters
  - Inter-character justification distributing residual space across all character gaps
  - Paragraph-final-line exclusion from justification (CSS standard)
  - MaxLines truncation with configurable ellipsis character and back-trimming
  - Codepoint-aware iteration (surrogate pairs are not split)
  - AutoSize and border pass-through (applied by callers, not by the layout engine)

**Rich text content** (`computeRichTextContent`): assembles text + format ranges from `RichTextData`,
with HTML entity decoding (6 named entities + numeric/hex), condenseWhite whitespace collapsing,
maxChars truncation, password masking (explicit character or bullet default), and serialized
`textFormatRanges` overlay with proper range splitting and format merging.

**Bounds** (`computeTextBoundsWidth/Height/OffsetX/Rectangle`): derives the box dimensions from
autoSize policy, wordWrap constraint, and measured content, with left/right/center anchor offset.

**Scroll metrics**: maxScrollH, maxScrollV, bottomScrollV, scrollYOffset, line count, text height and
width -- all from the computed layout result.

**Query surface** (12 functions): character-index-at-point, line-index-at-point, character boundaries,
selection rectangles, line metrics/length/offset/text, paragraph navigation, and link detection. Hit
testing scans groups linearly.

**Measure provider**: resolves through a two-tier fallback -- an explicitly set provider takes
precedence, then the registered `@flighthq/textshaper` backend, then null.

**Format helpers**: ascent/descent/height/leading from format size (hardcoded ratios), and
`mergeTextFormat` applying non-null override fields onto a base.

44 public exports (index.ts), 47 contract exports. Dependencies: `@flighthq/textshaper` and
`@flighthq/types` only.

## Gaps

**International typography** -- the largest functional gap, acknowledged by charter and status:

- Line breaking recognizes only U+0020 and explicit CR/LF. No UAX #14 break opportunity classes, so
  CJK ideographs never wrap, no-break space does not suppress a break, soft hyphens are ignored, and
  hyphens/dashes do not produce break opportunities.
- Iteration is codepoint-level, not grapheme-cluster-level. Extended grapheme clusters (ZWJ emoji
  sequences, combining marks, regional indicator pairs, Hangul syllables) can be split by wrapping
  and are presented as separate caret positions by the query surface.
- Direction resolves start/end alignment aliases and nothing else. No UAX #9 bidi itemization or
  visual reordering. `TextLayoutGroup` carries no bidi level. `@flighthq/textbidi` is not a
  dependency.

**Decomposition** -- `buildGroups` spans approximately 420 lines including its nested helper
closures, combining measurement, format-range traversal, word wrapping, long-word breaking, bullet
emission, truncation, and line construction in a single stateful closure. The charter's 2026-07-02
decision blessed extracting truncation, bullet emission, and justify into post-passes (as alignment
already is). This has not been done. The function works correctly but is the single hardest unit in
the package to modify or verify.

**Font metrics** -- `getTextFormatAscent` returns `size` and `getTextFormatDescent` returns
`size * 0.185` (textFormat.ts:6, :10). The shaper seam exposes `getFontMetrics` but this package
never calls it. The charter accepts this as the basic shaper's approximation, but no code path
exists to use real metrics when a richer backend provides them.

**Missing guard module** -- `getTextLayoutMeasureProvider` returns null when no provider and no
shaper backend are registered (textLayoutMeasure.ts:14). The layout then silently produces stale
results. This is the single most likely caller mistake, and the diagnostics convention requires a
shakeable `explain*` query and a guard module for silent sentinel cases.

**Justified lineWidths/textWidth report natural widths** -- the justification pass in `justifyLines`
mutates group `positions` and `width` after `writeLineMetrics` has already computed `lineWidths` and
`textWidth`. The result contract does not document whether these metrics represent natural or visual
widths. Consumers that use `lineWidths` to position overlays on justified text may misalign.

**Tab stops are position-only** -- no center/right/decimal tab alignment, no hyphenation seam.

**Vertical writing modes** and inline objects in layout groups are absent.

## Charter contradictions

No contradictions found. The charter's four decisions are either completed (actual-space
justification) or accurately reflected in the open items (buildGroups decomposition, font metrics
tier-dependency). The charter's open directions match the gaps above.

Two items worth noting:

- **Open direction 1 ("vestigial `_text` parameter")** was resolved in a previous session: the
  parameters were removed and `computeRichTextCharIndexAtPoint` no longer takes text. The direction
  entry is stale.
- **Open direction 4 ("Package Map update")** was completed. The entry is stale.

## Contract and docs fit

**Export lanes**: correctly configured with `.` (index.ts) and `./contract` (contract.ts). Three
contract-only exports (`TEXT_BOUNDS_GUTTER`, `TEXT_LAYOUT_GUTTER`, `createTextMetrics`) are
intentionally contract-only per status.md. `TEXT_BOUNDS_GUTTER` is needed by renderer overlays that
align with the layout gutter; an app-lane user wanting this value has no path to it.

**Type home**: no exported types are defined in this package. All types consumed and produced live in
`@flighthq/types`. Verified: no `export interface`, `export type`, or `export enum` in any
non-test source file.

**Import style**: type imports use separate `import type { }` statements throughout; no mixed
`import { type Foo, bar }` forms. No `@flighthq/sdk` imports.

**sideEffects**: `false` in package.json. Confirmed: no module-top-level registration, listener
setup, or global mutation. The module-level arrays/set in textLayout.ts and the `_measureProvider`
in textLayoutMeasure.ts are initialized to empty/null, not side effects.

**Source style violations** (6 in source, 4 in tests):
  - Structural divider comments in textLayout.ts at lines 86-88, 162-164, 485-487, 584-586, 730-732,
    771-773. Status.md lists 5 locations (lines 86, 162, 584, 730, 771), missing line 485 (the
    "Main loop" divider inside `buildGroups`).
  - Structural divider comments in textLayout.test.ts at lines 29-31 and 646-651.

**Module-level mutable state** in textLayout.ts (`_lineBreaks`, `_charAdvances`,
`_paragraphLastLines`) makes `computeTextLayout` non-reentrant. A recursive layout (e.g., a measure
callback that itself triggers layout) would corrupt the shared arrays. The `_measureProvider`
singleton in textLayoutMeasure.ts is a `set*Backend` pattern that the design constraints explicitly
ban ("No set*Backend singletons, no module-scoped mutable state that functions reach for"), though
the measure function is ultimately passed as a parameter to `computeTextLayout`, so the computation
itself takes explicit inputs. The singleton sits at the wiring layer, not the computation layer.

**`textFormatEquals` shallow array comparison** (richTextContent.ts:149-165): the function compares
array elements with `aValue[i] !== bValue[i]`, which is reference equality. For `tabStops`
(number[]) this is correct. For the `variations` field (`readonly FontVariation[]`), structurally
equal FontVariation objects with different references are treated as unequal, preventing format range
merging that should occur. Latent: `variations` is not consumed by the layout engine today, so the
issue affects only `computeRichTextContent` when two runs differ only by FontVariation reference
identity.

**Test coverage**: every source file has a colocated test file. Test `describe` blocks are
alphabetized and mirror exported names. 151 test cases cover the full exported surface, including
golden-value conformance tests for alignment, justification, and truncation. Tests use a fixed-width
measure function (10px/char), making assertions deterministic. `computeRichTextCharIndexAtPoint` in
richTextQuery.test.ts uses layout literals rather than running `computeTextLayout`, which is
appropriate for unit isolation but means the query surface is not integration-tested against a real
layout pipeline. No `as unknown as` double casts in source. Tests cast `RichTextRuntime` and
`TextLabelRuntime` with `as RichTextRuntime`/`as TextLabelRuntime`, supplying only the fields the
function needs -- acceptable narrowing.

## Candidate open directions

1. **Decompose `buildGroups`** into identified post-passes for truncation, bullet emission, and
   justification. Alignment is already a separate pass and demonstrates the pattern. The charter
   blessed this; measurement before and after would validate the extraction does not regress
   throughput.

2. **Guard module and explain query** for the null-measure-provider sentinel.
   `enableTextLayoutGuards()` emitting through `@flighthq/log` when `getTextLayoutMeasureProvider()`
   returns null, and `explainTextLayoutMeasureProvider()` returning plain data about why no provider
   is available.

3. **Consume real font metrics from the shaper seam** when the backend provides `getFontMetrics`.
   The charter approves this as a tier-dependent enhancement; the layout engine should prefer real
   ascent/descent over the hardcoded size/size*0.185 ratios when available.

4. **Document the justified-width contract** -- decide whether `lineWidths`/`textWidth` report
   natural or expanded widths, and make the result consistent with whatever the decision is.

5. **Fix `textFormatEquals` to compare FontVariation structurally** -- either compare `axis` and
   `value` fields, or require immutable references (matching the `readonly` modifier on the array).

6. **Remove structural divider comments** from textLayout.ts (6 instances) and textLayout.test.ts
   (4 instances) to comply with the Source Style rule. The function/file boundaries are sufficient.

7. **Remove stale charter open directions** (1 and 4) that were completed in previous sessions.

8. **UAX #14 line breaking, UAX #29 grapheme clustering, UAX #9 bidi** -- gated behind shaper-seam
   widening, as the charter notes. Long-term but the most significant functional gap.

9. **Resolve re-entrancy** by moving scratch arrays/sets into a caller-owned workspace or allocating
   them per call, so recursive layout through a measure callback is safe.
