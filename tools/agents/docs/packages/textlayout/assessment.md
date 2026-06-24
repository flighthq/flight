---
package: '@flighthq/textlayout'
updated: 2026-06-24
basedOn: ./review.md
---

# textlayout — Assessment

Sorted from `review.md` (score `solid — 68`). Absorbs the prior `reviews/maturation/depth/textlayout.md` Bronze/Silver/Gold roadmap, whose **Bronze tier has now largely landed** (justify, `start`/`end`, truncation, `<li>` bullets, the `kerning` flag, codepoint iteration, gutter de-dup, binary search) — so the seed's remaining weight is Silver/Gold, nearly all of which is gated on a cross-package shaper-seam decision and an unblessed charter. The charter is a pure stub (every section `_TODO_`), so "what good means here" is itself an open question; that keeps `Recommended` deliberately small — the genuinely sweep-safe items are a stray gutter literal and two test-coverage holes the worker itself flagged. Every algorithmic gap (bidi, UAX #14/#29, real metrics, the shaper-seam widening, the `-formats` neighbor) and every breaking-API or correctness ruling is a charter decision or crosses a package boundary, so it is routed to the charter's Open directions, not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/textlayout`, no cross-package coupling, no breaking change, no open design decision.

- **Replace the bare gutter literal in `richTextQuery.ts` with `TEXT_LAYOUT_GUTTER`.** `getLineOffsetY` starts `y = 2` (`richTextQuery.ts:237`) rather than referencing the now-unified constant. The diff de-duplicated the gutter across `textLayout.ts`/`textBounds.ts` but left this third literal behind — the exact drift the unification was meant to remove. Import and use the shared constant; pure in-package, no signature change. — review.md (Contract & docs fit, defect 4).

- **Add the missing wrap×truncation test.** The `breakLongWord` path and the main-loop path both call `checkTruncation` independently, and a single long word straddling the `maxLines` boundary is uncovered (worker Concern #2; review Status verification). Add a colocated `textLayout.test.ts` case for a long unbroken word that crosses the truncation line so the two truncation paths are exercised together. Test-only, within-package. — review.md (Status verification, live concern).

- **Pin down the bullet-overlap edge case.** `emitBullet` only auto-computes a positive `indent` when `indent <= 0` (`textLayout.ts:344`), so a large `•` glyph with an explicit small/zero `indent` overlaps the text (worker Concern #1). This needs no design ruling: either document the behavior as intentional (user-set `indent` wins) with a test asserting it, or clamp `indent` up to the bullet width when a bullet is emitted, with a test. Keep it within the current `TextFormat` shape — a new `hangingIndent` field is a charter/types decision (routed to Backlog). — review.md (Status verification, live concern).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Drop the dead `_text` parameter from `getRichTextCharBoundaries` / `getRichTextCharIndexAtPoint`.** The argument is never read; pre-release license (codebase map) favors removing it over a deprecation. **Parked:** it is a **breaking API change** to the public surface, which the Recommended bar excludes even when pre-release makes it welcome — it wants an explicit "yes, break it now" rather than a blanket sweep. Routed to Open directions (#6). — review.md (Contract & docs fit, defect 1).

- **Re-ground the justification model on actual inter-word spaces.** `justifyLines` distributes residual width over format-group boundaries (`lineGroups.length - 1`), so a single-format multi-word line gets `spaceCount === 0` and is not justified at all (`textLayout.ts:650-651`). **Parked:** this is a **correctness ruling on a just-shipped feature whose bar the stub charter never set** — whether the by-group-boundary model is an accepted interim or must count real spaces is a charter decision, not sweep-safe work. Routed to Open directions (#5).

- **Real font metrics through the shaper seam.** Replace the `size` / `size * 0.185` ratio constants in `textFormat.ts` with backend-provided ascent/descent/lineGap/x-height. **Parked:** requires widening `shapeText(text, format): number` to return metrics — cross-package (`textshaper`). Routed to Open directions (#2).

- **Shaper-seam widening to clusters + advances + bidi levels (`ShapedGlyphRun`).** The single biggest dependency: gates RTL positioning, ligatures, decimal tabs, real metrics, and GPU/WebGPU text. **Parked:** a joint design touching `textshaper`, `textlayout`, `text`, `textinput`, and the Rust mirror. Routed to Open directions (#2).

- **`@flighthq/textlayout-formats` neighbor + UAX #14 line breaking + UAX #29 grapheme clustering.** Break-opportunity-driven wrapping (so CJK wraps, hyphens break, `nbsp` holds) and full extended grapheme clusters, with the tables shipped in a tree-shakable `-formats` neighbor. **Parked:** new triad cell (cross-package) under the plurality guard, plus a vendored-vs-generated table decision and new `@flighthq/types` kinds (`TextBreakClass`/`TextBreakOpportunity`). Routed to Open directions (#3).

- **Bidirectional layout (UBA / UAX #9).** `resolveTextBidiLevels` + `reorderTextLineVisually`; emits groups in visual order and makes the Bronze `start`/`end` resolution direction-accurate. **Parked:** the largest algorithmic gap; gated on the shaper-seam widening and on pinning the algorithm to the Rust `unicode-bidi` stack for bit-determinism. Routed to Open directions (#2, #4).

- **Tab alignment variants** (`center`/`right`/`decimal`) and **ordered list markers** (`decimal`/`lowerAlpha`/`upperRoman`). **Parked:** each needs new `@flighthq/types` kinds (`TextTabAlignment`/`TextTabStop`; extending `TextListMarker`); decimal tabs additionally depend on the widened seam (measure following-run width). Small individually, but cross-package by the header-layer rule. Routed to Open directions (#2, #3).

- **`interCharacter` justification + Kashida hook, hyphenation seam.** Silver-tier; `interCharacter` needs cluster-level expansion (widened seam), hyphenation needs a `TextHyphenationBackend` type in `@flighthq/types`. **Parked:** cross-package types + seam dependency.

- **Vertical/mixed writing modes, inline objects/embedded runs, Knuth–Plass optimal breaking, pooling + incremental relayout, conformance corpus, 1:1 Rust parity.** **Parked:** Gold tier — each is large scope (the writing-mode/inline-object items reshape the layout coordinate model and every query function), and several are explicitly out-of-scope questions for an OpenFL-target SDK (vertical modes) that the charter must settle first. The conformance corpus and Rust parity are cross-cutting tracks that should mirror each TS algorithm only after Silver stabilizes. Routed to Open directions (#1, #7).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review already enumerates these; the assessment confirms they are the forks that keep the bulk of the backlog parked.

1. **North star** — confirm the durable bar (likely: a renderer-agnostic, shaper-fed layout spine, bit-deterministic against the Rust `flighthq-textlayout` mirror, full OpenFL `TextField` surface, correct international text at Silver). Until this exists, justification correctness and Gold scope cannot be judged.
2. **Shaper-seam widening** — agree the `ShapedGlyphRun` shape (ids/advances/offsets/cluster map + bidi levels) and whether width-only callers keep a fast path, before bidi/metrics/decimal-tab work. Cross-package (`textshaper`/`text`/`textinput`/Rust mirror); gates most of Silver.
3. **`@flighthq/textlayout-formats` neighbor** — approve/deny the `-formats` cell for the UAX #14/#29 tables, and decide vendored vs. UCD-generated (size/licensing; verify with `npm run size`).
4. **Bidi algorithm choice** — pin TS bidi to the Rust `unicode-bidi` stack for conformance-corpus bit-determinism before any UBA implementation.
5. **Justification correctness target** — accept the inter-word-by-format-group-boundary model as an interim, or re-ground it on actual inter-word space positions (so single-format multi-word lines justify).
6. **`_text` parameter removal** — confirm the breaking removal of the dead `text` argument from the two query functions now (pre-release license), rather than carrying the deprecation.
7. **Vertical writing modes / inline objects** — in scope for an OpenFL-target SDK, or explicit non-goals the charter can name.
