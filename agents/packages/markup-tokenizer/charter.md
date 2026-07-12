---
package: '@flighthq/markup-tokenizer'
draft: true
lastDirection: 2026-07-12
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# markup-tokenizer — Charter (reserved home)

## What it is

`@flighthq/markup-tokenizer` is the reserved home for the **lenient angle-bracket lexer** that sits *below* markup meaning — the layer that turns a `<b>hi <i>there</i></b>`-style string into a flat stream of text runs and open/close/void tag tokens (name + entity-decoded attributes), tolerating malformed input rather than rejecting it. It is the parse-structure half of markup, distinct from the meaning half (`text-markup`'s tag registry, which maps a tag name to its `TextFormat` contribution).

The distinction is deliberate and already drawn in `text-markup`'s own comments: **`@flighthq/xml` is strict** (a well-formedness parser — a malformed document is an error), while authoring markup is **lenient** (an unknown or unbalanced tag degrades gracefully, never throws). A designer's `htmlText`-style string is not guaranteed well-formed XML, so it cannot go through `xml`; it needs a forgiving lexer. That lexer is the bedrock this package would hold.

## Build posture — reserved, not yet built (one consumer today)

`text-markup` today carries its own small lenient tokenizer inline (`/<[^>]*>/g` plus attribute splitting). That is **correct for now**: with a single consumer, an inline lexer meets the cost bar ("pay for a screw's worth of tokenization, not a lawnmower") and there is nothing to share. Extracting a package now would be over-decomposition against a single caller — the register's blood-from-a-stone gate (fork E).

**When it gets built:** the first time a **second lenient-markup consumer** appears and would otherwise copy the lexer. The concrete trigger is a **UI-markup importer** — the visual-authoring arc (fork I) brings SVG/Rive/Lottie and, with them, styled-text runs and label markup that want the same forgiving tokenizer. At the second consumer, extract `text-markup`'s inline lexer into this package unchanged and have both depend on it; the tokenizer's shape is already proven by `text-markup`'s use.

## Boundaries (for when it is built)

- **Structure only, no meaning.** Emits text/tag tokens with decoded attributes; it never knows what `<b>` *means* — that stays in a `text-markup`-style tag registry. Same parse-vs-meaning split the two layers already observe.
- **Lenient, not strict.** Malformed input degrades (unbalanced tags, stray `<`, unknown tags pass through as tokens); it never throws. This is exactly what separates it from `@flighthq/xml`.
- **Value-leaf, deps-minimal.** Plain-data tokens over `@flighthq/types` only; no scene graph, no format model. An entity-decode seam so callers share one HTML-entity table rather than re-shipping it.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-12] Chartered as the reserved home for the lenient markup lexer; not built yet.** `text-markup` keeps its inline tokenizer while it is the only consumer; extract into this package at the second lenient consumer (the UI-markup importer of fork I), moving the proven lexer unchanged. User-directed 2026-07-12 ("note it or build it" → noted; the extract-at-second-consumer discipline holds).

## Open directions

1. **The second consumer that triggers extraction** — a UI-markup / rich-label importer from the visual-authoring arc (fork I).
2. **Entity-decode seam** — whether the HTML-entity table lives here (shared) or stays a caller concern; decide when the second consumer's needs are known.
3. **Streaming vs. one-shot** — one-shot tokenization is enough for authoring strings; a streaming lexer is only worth it if a large-document consumer appears.
