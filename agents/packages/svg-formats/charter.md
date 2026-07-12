---
package: '@flighthq/svg-formats'
draft: true
lastDirection: 2026-07-12
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# svg-formats — Charter (reserved home)

## What it is

`@flighthq/svg-formats` is the reserved home for **static SVG import** — parsing an SVG document into Flight's vector primitives: `@flighthq/shape` command streams and a display subtree. It is the vector-graphic importer in the visual-authoring-artifact arc ([structural-forks](../structural-forks.md#i-visual-authoring-artifacts-import-as--formats-not-as-a-code-layout-dsl)), the static sibling of `lottie-formats` (animated vector) and `rive-formats` (vector + state machines).

Path *data* (`d="…"`) already lands in `@flighthq/path-formats` (`parseSvgPathData`); this package is the layer above it — the whole document: shapes (`rect`/`circle`/`ellipse`/`line`/`polyline`/`polygon`/`path`), fills/strokes, gradients, groups and transforms, `use`/`defs`, and text — assembled into Flight shape/display nodes.

## Scope — "to a point" (the deliberate line)

**In scope:** SVG *as a static vector graphic*. **Out of scope:** SVG *as a live document* — SMIL/CSS animation (→ `lottie-formats`/`rive-formats` own animation), `<filter>` pipelines (→ `@flighthq/effects`), scripting, `foreignObject`, and interactivity (→ app code). Importing produces plain Flight data; it never carries a live SVG runtime. This keeps the cell a codec, not an engine.

## Boundaries (for when it is built)

- **`-formats` codec, not a runtime.** SVG bytes/text → Flight `shape`/display data. One-way import is the bedrock; round-trip serialize is a later question.
- **Builds on `path-formats`.** Path data reuses `parseSvgPathData`; this cell owns only the element/attribute/document layer above it — no duplicate path parser.
- **Well-homed output.** Emits `@flighthq/shape` commands + a display subtree; it introduces no new geometry primitive.
- **Lenient where authoring tools vary; strict where SVG is strict.** Unknown elements degrade rather than throw; the XML backbone can use `@flighthq/xml` (SVG is XML — unlike lenient authoring markup).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-12] Chartered as a candidate; not built.** Part of the visual-authoring-import arc (fork I). Static-vector scope only; path data delegates to `path-formats`; output is `shape`/display data. Bless-to-build is the user's. User-directed 2026-07-12 ("SVG to a point, in scope as a `-formats` member").

## Open directions

1. **Text handling** — map SVG `<text>`/`<tspan>` onto Flight's text stack (`shape`-drawn vs. `TextLabel`/`RichText`); the lenient styled runs here are a second consumer for `markup-tokenizer`.
2. **Gradients/patterns fidelity** — how far to match SVG gradient/pattern semantics against `shape`'s fill model.
3. **The fit-to-viewport seam** — an imported SVG is fixed-size; the responsive constraint/anchor layer (fork I, open) is where resizing is solved, not here.
