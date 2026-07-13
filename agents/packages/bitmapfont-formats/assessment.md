---
package: '@flighthq/bitmapfont-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# bitmapfont-formats — Assessment

## Recommended

Sweep-safe, within-package:

1. **`explainBitmapFontParse(text)`** — a shakeable plain-data query for the multi-cause null sentinel (missing `common`/`chars`, malformed XML/JSON, which page id failed to resolve), per the diagnostics inversion rule. The parse paths already distinguish these causes internally.
2. **Tolerant `chars`-as-object JSON reading** — accept the object-map `chars`/`kernings` shape some BMFont JSON exporters emit alongside the array shape; a contained reader widening in `bitmapFontJson.ts` with fixtures (first slice of charter Open direction 3).
3. **Cross-variant fixture hardening** — add real-world exporter fixtures (BMFont64, Hiero text output) to the existing equivalence tests, pinning quirk tolerance where it already works.
4. **BMFont binary `.fnt` parser** — `parseBitmapFontBinary(bytes)` over the same `BitmapFontRecord`; charter Open direction 2, self-contained (the record layer makes it a pure front-end), null sentinel on bad magic/version. Its own module so it tree-shakes independently.

## Backlog

- **Preserve `distanceField.range` (+ `info.size`)** — parked: blocked on the `BitmapFont` model growing distance-field parameters (`@flighthq/types` + `bitmapfont` decision first; see that cell's assessment).
- **`formatBitmapFontXml`/`formatBitmapFontJson`** — parked: the charter decision blesses text-form re-emission only; adding the variants is a scope call for the charter (parity-with-siblings argument in the review).
- **Hiero/Shoebox/`fontbm` full quirk matrix** — parked: charter Open direction 3 beyond the sweep-safe JSON-shape slice above; needs fixture sourcing and a scope decision.
- **`.ttf` → bitmap bake pipeline** — parked: charter Open direction 1, cross-package (`glyphatlas`) and build-time tooling shaped.
- **`BitmapFontRecord` public-vs-internal** — parked: barrel-surface design question (review open direction) for the charter.

## Approved

_Empty — awaiting the user's verbal approval gate._
