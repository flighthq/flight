---
id: font
title: '@flighthq/font'
type: new-package
target: font
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/font.md
  - tools/agents/docs/reviews/breadth/text-typography.md
depends_on: []
updated: 2026-06-23
---

## Summary

A real font subsystem — family/weight/style/stretch matching, fallback chains, codepoint coverage queries, variable-font axes, font metrics, and missing-glyph (tofu) handling — distinct from today's single `Font { name }` interface and the loaders bolted onto `@flighthq/resources`.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable font model: replace `Font { name }` with a real family/face split, weight/style/stretch matching against a collection, and a usable fallback chain. The 80/20 that lets the text stack resolve "bold italic Helvetica, fall back to a default" correctly.

- **Types in `@flighthq/types`:**
  - `FontWeight` — numeric (100–900) with named constants `FontWeightThin`…`FontWeightBlack` (`400` = `FontWeightNormal`, `700` = `FontWeightBold`). Numeric so variable-font axes and matching distance work.
  - `FontStyleKind` — string `*Kind`: `'Normal' | 'Italic' | 'Oblique'`.
  - `FontStretchKind` — string `*Kind`: `'UltraCondensed' | 'ExtraCondensed' | 'Condensed' | 'SemiCondensed' | 'Normal' | 'SemiExpanded' | 'Expanded' | 'ExtraExpanded' | 'UltraExpanded'`.
  - `FontFaceDescriptor` — the _requested_ face: `{ family: string; weight: FontWeight; style: FontStyleKind; stretch: FontStretchKind }` (a `*Like` plain-data query input).
  - `FontFace` (Entity) — a _physical_ face: descriptor fields + `{ source: FontFaceSource | null }` (the loaded `FontFace`/buffer handle or system reference). Replaces the role of today's `Font`.
  - `FontFamily` (Entity) + `FontFamilyRuntime` — a named family owning its registered `FontFace[]`.
  - `FontCollection` (Entity) + `FontCollectionRuntime` — the registry of families a renderer/app draws from, plus an ordered `fallback: string[]` default chain.
- **`@flighthq/font`:**
  - `createFontFaceDescriptor(obj?: Partial<FontFaceDescriptor>): FontFaceDescriptor` — constructor, defaults `weight 400 / Normal / Normal`.
  - `createFontFace(descriptor, source): FontFace`, `createFontFamily(name): FontFamily`, `createFontCollection(): FontCollection`.
  - `registerFontFace(collection, face): void` — add a face under its family (creating the family if absent). Last-write-wins.
  - `getFontFamily(collection, name): FontFamily | null` — sentinel on miss.
  - `matchFontFace(family, descriptor, out: FontFace): boolean` — the CSS font-matching algorithm (stretch → style → weight ordering, with the standard weight-distance rule), `out`-param, alias-safe; returns `false` when the family has no faces. The core Bronze function.
  - `resolveFontFace(collection, descriptor, out: FontFace): boolean` — match within the requested family; if it has no acceptable face, walk `collection.fallback` in order. The single entry point text/shaper call.
  - `getFontFallbackChain(collection, family, out: string[]): void` — the resolved ordered chain (requested family first, then defaults), `out`-param.
  - `setFontCollectionFallback(collection, families: Readonly<string[]>): void`.
- **`resources` rewrite:** `loadFontFrom*` register the loaded face into a `FontCollection` (the loaders gain a target collection) instead of returning bare `Font`. `Font { name }` is removed from `@flighthq/types`.
- **Effort:** moderate. The match algorithm is well-specified (CSS Fonts §5); the rest is constructors/registry glue. Touches `resources` and the `TextFormat.font: string` consumers (which now resolve through `resolveFontFace`). This is the gap that makes _any_ weight/style selection real.

### Silver

Competitive with a good font library (fontkit / browser font matching): codepoint coverage and per-codepoint fallback, font metrics, variable-font axes, system-font discovery via the backend seam, and missing-glyph handling.

- **Types in `@flighthq/types`:**
  - `FontMetrics` — `{ unitsPerEm; ascent; descent; lineGap; capHeight; xHeight; underlinePosition; underlineThickness; strikeoutPosition; strikeoutThickness }` (font-design units; layout scales by size). Closes the "no real vertical metrics from the face" gap that `textlayout` currently approximates from `TextFormat`.
  - `FontCoverage` — opaque runtime coverage structure (codepoint set / interval list from `cmap`); queried, never a public literal.
  - `FontVariationAxis` — `{ tag: string; min: number; default: number; max: number; name: string }` (`'wght'`, `'wdth'`, `'slnt'`, `'opsz'`, custom).
  - `FontVariationInstance` — `{ name: string; coordinates: Record<string, number> }` (named instances from `fvar`).
  - `FontVariationSettings` — `Record<string, number>` (axis-tag → value), the requested point in axis space.
  - Extend `FontFace` with `metrics: FontMetrics | null`, `coverage: FontCoverage | null`, `variationAxes: FontVariationAxis[]`, `variationInstances: FontVariationInstance[]`, `isVariable: boolean`.
  - `FontBackend` — `{ listSystemFamilies(): Promise<string[]>; querySystemFace(descriptor): Promise<FontFace | null>; isFamilyAvailable(family): Promise<boolean> }`.
  - `MissingGlyphPolicyKind` — `'Tofu' | 'Hide' | 'Fallback'` string kind (what to do when no face covers a codepoint).
- **`@flighthq/font`:**
  - **Backend seam:** `getFontBackend()`, `setFontBackend(backend | null)`, `createWebFontBackend()` (over `document.fonts` + the Font Access `queryLocalFonts` API where available; returns `[]`/`null`/`false` sentinels when absent — never throws), `listSystemFontFamilies(): Promise<string[]>`, `isFontFamilyAvailable(family): Promise<boolean>`.
  - **Coverage / per-codepoint fallback:** `hasFontCoverage(face, codepoint): boolean`, `resolveFontFaceForCodepoint(collection, descriptor, codepoint, out: FontFace): boolean` (walk the chain until a face _covers_ the codepoint — the CJK/emoji fallback path), `getFontCoverageRanges(face, out: FontCoverageRange[]): void`.
  - **Metrics:** `getFontMetrics(face, out: FontMetrics): boolean`, `getScaledFontMetrics(face, size, out: FontMetrics): void` (design-units → pixels at a size), `getFontLineHeight(face, size): number`.
  - **Variable fonts:** `getFontVariationAxes(face, out: FontVariationAxis[]): void`, `createFontVariationSettings(obj?): FontVariationSettings`, `clampFontVariationSettings(face, settings, out): void` (clamp to each axis range), `resolveFontVariationInstance(face, name): FontVariationInstance | null`, `deriveFontFaceFromVariation(face, settings): FontFace` (a concrete face pinned at axis coordinates — what the shaper actually uses).
  - **Missing glyph:** `setFontMissingGlyphPolicy(collection, policy): void`, `getFontNotdefFace(collection): FontFace | null` (the explicit tofu source).
- **`@flighthq/font-formats`** (new neighbor): `parseFontFace(buffer: ArrayBuffer, out: FontFace): boolean` — read `name`/`head`/`hhea`/`OS/2`/`post` for metadata+metrics, `cmap` for coverage, `fvar`/`STAT` for axes/instances, **without** a host engine. `getFontFaceFormatKind(buffer): FontFaceFormatKind | null` (`'TrueType' | 'OpenTypeCFF' | 'WOFF' | 'WOFF2' | 'Collection'`). This is what gives GPU/native (no DOM `FontFace`) real metrics and coverage.
- **Cross-backend consistency:** matching, coverage, metrics, and axis resolution are **pure data** — identical on Canvas/DOM/GL/WGPU and native. Only _discovery_ differs (the `FontBackend`); the resolved `FontFace` feeds every backend's shaper identically.
- **Effort:** the bulk is `font-formats` table parsing (bounded, well-documented binary) and the coverage/metrics types threading into `textlayout`. The variable-font and per-codepoint-fallback work is what makes complex-script and CJK rendering possible once the HarfBuzz shaper lands. This is the "use it in production for international text" tier.

### Gold

Authoritative reference: full OpenType selection surface, font synthesis, collection (`.ttc`) and emoji handling, allocation discipline, signals, exhaustive tests, docs, and Rust parity.

- **Types in `@flighthq/types`:**
  - `OpenTypeFeatureTag` + a `FontFeatureSettings` (`Record<string, number>`) — general feature control (`'liga'`, `'dlig'`, `'smcp'`, `'onum'`, `'tnum'`, stylistic sets `'ss01'`…) the shaper consumes (closing the "only `kerning` boolean" gap in `TextFormat`).
  - `FontSynthesis` — `{ bold: boolean; italic: boolean }` (faux-bold / faux-oblique policy when no real face exists).
  - `FontMatchScore` — `{ face: FontFace; distance: number }` for ranked matching / diagnostics.
  - `FontPaletteKind` / `FontPalette` — `CPAL`/`COLR` color-font palette selection (color emoji, multi-color OpenType).
  - `FontScriptKind` / `FontLanguageKind` — script/language tags (`'latn'`, `'arab'`, `'hani'`; `'ENG '`, `'ARA '`) for script-aware feature and fallback selection.
  - `FontCollectionStats` — `{ familyCount; faceCount; variableFaceCount; coverageCacheBytes }`.
- **`@flighthq/font`:**
  - **Ranked matching & synthesis:** `scoreFontFaces(family, descriptor, out: FontMatchScore[]): void` (full ranked list), `synthesizeFontFace(face, synthesis): FontFace` (faux bold/italic transform descriptor when the real face is absent), `getFontSynthesisFor(family, descriptor, out: FontSynthesis): void`.
  - **Script-aware fallback:** `resolveFontFaceForScript(collection, descriptor, script, out): boolean`, per-script fallback chains (`setFontScriptFallback(collection, script, families)`), and grapheme-cluster-aware run coverage `getFontRunsForText(collection, descriptor, text, out: FontRun[]): void` (segment a string into `{ start, end, face }` runs by coverage — the itemization the shaper needs; emoji-cluster aware).
  - **Feature & palette control:** `createFontFeatureSettings(obj?)`, `mergeFontFeatureSettings(base, over, out)`, `getFontColorPalettes(face, out: FontPalette[]): void`, `getFontPaletteColors(face, paletteIndex, out: number[]): void` (packed RGBA, COLR/CPAL).
  - **Collections & emoji:** `parseFontCollection(buffer, out: FontFace[]): number` (`.ttc`), `hasFontColorGlyphs(face): boolean` (COLR/CBDT/sbix), emoji/notdef wiring into `getFontNotdefFace`.
  - **Allocation discipline:** `acquireFontMatchScore()` / `releaseFontMatchScore(score)` paired pool brackets; coverage queries and run segmentation via `out`-params with zero steady-state allocation; a coverage cache on `FontFaceRuntime` (lazy, disposable).
  - **Signals:** `enableFontCollectionSignals(collection)` → `onFontFaceRegistered`, `onFontCollectionChanged`, `onFontFallbackResolved` (so the layout/glyph-atlas caches invalidate when a late-loaded fallback face arrives).
  - **Teardown:** `disposeFontCollection(collection)` (detach signals, drop coverage caches → GC) and `disposeFontFace(face)`. `destroy*` only appears if a face ever owns a non-GC handle (e.g. a native font handle from the backend) — then `destroyFontFace` frees it.
  - **Edge cases:** missing `OS/2` table (derive weight/stretch from `name`), conflicting `fvar` defaults vs named instances, weight `0`/out-of-range clamping, duplicate family registration, WOFF2 without a decompressor present (sentinel, not throw), `.ttc` index out of range, codepoints in supplementary planes / surrogate pairs.
- **Tests:** colocated `*.test.ts` per file; the CSS font-matching algorithm tested against the spec's worked examples; coverage/metrics fingerprints over canonical fonts; `out`-aliasing tests for every `out`-param fn; sentinel/missing-table paths asserted; `font-formats` parser tested against known-good table dumps.
- **Rust parity:** `flighthq-font` + `flighthq-font-formats` 1:1 conformant. Matching, coverage, metrics, axis resolution, and run segmentation are deterministic value-typed leaves on the conformance/mixing path (a `font-rs` shim is viable). `ttf-parser` backs the Rust formats crate; the `FontBackend` trait gets a native enumerator (behind `native`) and the `host-web` fill. The divergence map records any TS↔Rust gaps (e.g. system-discovery results are environment-dependent and excluded from the deterministic conformance cells).
- **Docs:** the font-matching algorithm and weight-distance rule, the design-units→pixels metric convention, the variable-font axis-clamping rules, the fallback-chain resolution order, and the feature-settings vocabulary.

## Boundaries

- **Loading bytes stays in `@flighthq/resources`.** `font` models and matches _already-loaded_ faces; fetching `.woff2`/`.ttf` over the network and the `FontFace`/`document.fonts` lifecycle stay in `resources` (rewritten to register into a `FontCollection`).
- **Shaping stays in `@flighthq/textshaper`.** Turning a run + resolved face into glyph IDs/advances/offsets/clusters (HarfBuzz/rustybuzz) is the shaper's job. `font` _selects the face and segments runs by coverage_; it does not shape. `FontFeatureSettings`/`FontVariationSettings` are produced here and _consumed_ by the shaper.
- **Layout stays in `@flighthq/textlayout`.** Line breaking, wrapping, alignment, and positioning consume `FontMetrics` from `font` but live in `textlayout`.
- **Bidi/itemization-by-direction stays out.** `font` segments runs by _coverage/script_; UAX #9 embedding levels and reordering belong to the requested `@flighthq/textbidi` (or `textlayout`). The two itemizations compose; they are distinct concerns.
- **Glyph rasterization and the GPU glyph atlas stay out.** Rendering a glyph to pixels / SDF and packing it belong to the text-GPU stack (`@flighthq/text-gl`/`atlas-packer`). `font` provides coverage, metrics, and the resolved face; it produces no pixels.
- **Grapheme/word segmentation (UAX #29) stays in `textsegment`/`textlayout`.** `font` consumes cluster boundaries for emoji-aware run coverage but does not own the segmenter.
- **Locale identity stays in `@flighthq/platform`.** `font` takes a script/language tag as input; it does not resolve the user's locale.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Retiring `Font { name }`.** Bronze removes `Font` in favor of `FontFamily`/`FontFace`. Is a one-step replacement acceptable (pre-release, no consumers), or should `Font` alias `FontFamily` briefly? Recommendation: remove it — the map's "rename, don't accumulate workarounds" rule applies.
- **Where the fallback chain lives.** Default chain on `FontCollection` vs. per-`TextFormat`. Recommendation: collection owns the default ordered chain; `TextFormat.font` is the requested family that resolves _through_ it — keeps `TextFormat` a thin descriptor.
- **`FontBackend` granularity.** Should system-face _metrics_ come from the backend (OS) or always from `font-formats` parsing the bytes? Native hosts have metrics cheaply via the OS; the web mostly does not. Recommendation: prefer parsed metrics for determinism/conformance; let the backend supply them only for system faces whose bytes are inaccessible.
- **Coverage representation.** Codepoint interval list vs. bitset vs. a roaring-style structure — affects memory for large CJK fonts and the Rust mirror's determinism. Needs one representation fixed across TS and Rust.
- **Variable-font pinning vs. live axes.** Does the shaper receive a `deriveFontFaceFromVariation` concrete face, or the base face + `FontVariationSettings`? Affects caching (one cache key per pinned face vs. per face+settings). Recommendation: pass settings to the shaper; cache by face+settings.
- **`font-formats` WOFF2 decompression dependency.** WOFF2 needs Brotli; that is a real dependency that would weigh the formats package. Should WOFF2 parsing be a further sub-cell, or rely on the host having decompressed to raw OpenType first? Surface as a packaging decision.
- **System-font discovery and conformance.** `listSystemFontFamilies` is environment-dependent and cannot be in the deterministic Rust↔TS conformance cells. Confirm it is excluded in the divergence map and only the pure matching/coverage/metrics core is on the parity differ.

## Agent brief

> Create `@flighthq/font` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
