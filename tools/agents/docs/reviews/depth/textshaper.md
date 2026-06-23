# Depth Review: @flighthq/textshaper

**Domain**

Text shaping — the layer that turns a text run (string + font/format) into the geometry a layout engine and renderer need: at minimum advances/widths, and at full strength positioned glyphs (glyph ids, x/y advances and offsets, and clusters), with support for font features (kerning, ligatures), bidi/script itemization handoff, and complex-script correctness (GSUB/GPOS). The canonical reference points are HarfBuzz / rustybuzz and the browser `measureText` floor.

**Verdict:** stub — completeness 18/100

The package is a registration seam plus a single delegating function. It is a well-formed _seam_, but as a text-shaping _library_ taken alone it provides almost none of what the domain implies. Critically, this is **mostly missing-by-design**: the project's own text design doc ([rust/text.md](../../rust/text.md)) explicitly defines `textshaper` as the "advances-only measure tier" and defers the full-glyph shaper (HarfBuzz/rustybuzz, `ShapedRun`/`ShapedGlyph`, clusters) to a future sibling crate/feature. Judged purely on present depth, however, it is a stub.

## Present capabilities

The entire public surface (`/home/joshua/Development/flight/worktrees/review/packages/textshaper/src/textShaper.ts`):

- `getTextShaperBackend(): TextShaperBackend | null` — returns the active backend or `null`.
- `setTextShaperBackend(backend | null): void` — installs/clears the backend; last-write-wins, never throws on re-registration.
- `shapeText(text, format): number` — delegates to `backend.measureText`, returning the horizontal advance in pixels, or the sentinel `-1` when no backend is registered.

The backend contract (`/home/joshua/Development/flight/worktrees/review/packages/types/src/TextShaper.ts`) is a single method:

- `TextShaperBackend.measureText: TextMeasureFunction` — `(text, format) => number` advance width. Deliberately identical in shape to text-layout's `TextMeasureFunction`, so the seam subsumes the older measure-provider.

This is a clean, correct, side-effect-free, tree-shakable seam: no module-load registration, sentinel return for the unconfigured case, null-clear semantics, and the canvas/HarfBuzz backends correctly pushed out to sibling packages (`textshaper-canvas`, future `textshaper-harfbuzz`). Tests cover all three functions including the unregistered, delegating, and last-write-wins cases.

## Gaps vs an authoritative shaping library

Against a mature shaper (HarfBuzz/rustybuzz), essentially the entire substantive feature set is absent. `shapeText` returns a single `number` (total advance), not shaped geometry:

- **Shaped output types.** No `ShapedRun` / `ShapedGlyph` (glyph ids, `xAdvance`/`yAdvance`, `xOffset`/`yOffset`, `cluster`). The header doc names these but they are explicitly deferred — they do not exist in `@flighthq/types`. Without them no GPU/software backend can rasterize text (the browser hides glyph ids, so `measureText` alone only enables Canvas `fillText`).
- **Per-glyph advances/positions.** Only a scalar total advance is produced; no per-glyph or per-cluster array, so caret/selection hit-testing can only sum per-character advances (wrong across ligatures/reordering — the exact defect the doc says shaping is meant to fix).
- **Clusters.** No cluster mapping (string index ↔ glyph), required for correct caret movement, selection, and grapheme-aware editing.
- **Font features / GSUB / GPOS.** No kerning (beyond whatever a backend recovers via adjacent-pair measuring), ligatures, contextual alternates, or arbitrary OpenType feature toggles (`liga`, `kern`, `smcp`, `ss01`...). No feature-tag API at all.
- **Complex scripts.** No joining (Arabic), reordering/conjuncts (Indic/Thai), or mark placement (Hebrew/diacritics). These are impossible with an advances-only tier.
- **Bidi / script / direction.** No script itemization, no `direction` (LTR/RTL/TTB) handling, no language tagging. The doc places itemize/bidi adjacent to this seam but nothing here consumes or produces it.
- **Vertical text.** No `yAdvance`/vertical metrics; horizontal-only.
- **Font metrics.** No ascent/descent/line-gap/x-height/cap-height accessors, no glyph extents/bounds, no font-unit↔pixel scaling helpers — a real shaper exposes these for layout.
- **Variable fonts.** No variation-axis (`wght`, `wdth`...) parameters.
- **Caching / buffer reuse.** No shaping cache or reusable buffer; the seam is one synchronous scalar call.

## Naming / API-shape notes

- Names are canonical and self-identifying: `getTextShaperBackend` / `setTextShaperBackend` / `shapeText` follow the project's `get*`/`set*` and full-type-word conventions, and match the Rust port (`get_text_shaper_backend` / `shape_text`, sentinel `-1.0`) 1:1.
- `shapeText` returning a bare `number` is honest for the measure-only tier but is a naming overreach: "shape" implies glyph output, and the function only measures. The doc anticipates the upgrade path (a richer backend adds cluster/glyph methods without breaking advances-only callers), so the name is forward-looking rather than wrong — but today `measureText` would describe the behavior more truthfully.
- The seam-over-swappable-backend shape (`*Backend` interface in `@flighthq/types`, `register/set` in the owning package, no load-time registration, sentinel when unset) is exactly the project's house pattern and is executed correctly.
- The deliberate equivalence `TextShaperBackend.measureText === TextMeasureFunction` is a good design move: it lets the shaper seam subsume text-layout's older measure provider with zero adapter.

## Recommendation

Accept as a deliberately minimal seam, not as an authoritative shaping library — the depth gap here is policy, not oversight, and the design doc owns it. To become authoritative in its domain (and to unblock all non-Canvas text rendering, which currently cannot get glyph ids), this package needs the full-glyph tier the doc already specifies:

1. Add `ShapedGlyph` and `ShapedRun` header types to `@flighthq/types` (`glyphId`, `cluster`, `xAdvance`/`yAdvance`, `xOffset`/`yOffset`; run-level `font`/`direction`/`script`).
2. Extend `TextShaperBackend` with a `shapeRun(text, format, opts) => ShapedRun` method (keeping `measureText` for the lightweight tier) and add a `shapeTextRun(...)` free function alongside `shapeText`.
3. Add a font-metrics accessor path (ascent/descent/line-gap, glyph extents) and a feature/variation options type so layout and GPU rasterization have real inputs.
4. Land the full-glyph backend as the planned sibling (`@flighthq/textshaper-harfbuzz`, harfbuzz-wasm) so the heavy dependency stays opt-in per the bundle-size rule.

Until then the verdict is stub: correct and well-shaped, but it measures rather than shapes, and a developer reaching for "the shaping library" finds only an advance-width delegate.
