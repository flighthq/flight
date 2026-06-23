---
id: spritesheet-formats
title: '@flighthq/spritesheet-formats'
type: depth
target: spritesheet-formats
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/spritesheet-formats.md
  - tools/agents/docs/reviews/depth/spritesheet-formats.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 68/100. A clean, symmetric, round-trip-capable interop layer for three formats (Texture Packer JSON, Aseprite JSON, Starling/Sparrow XML), short of authoritative on format breadth and on robustness within the formats it already supports.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, genuinely-useful jump: one ubiquitous missing format, the descriptor-less common case, format sniffing, and the robustness fix that turns "industry-standard import" from a liability into a guarantee. All additive, all tree-shakable.

- **libGDX / Spine `.atlas` text format** — the largest single hole; arguably the most ubiquitous open atlas format.
  - `libgdxAtlasSchema.ts`: `LibgdxAtlasDocument`, `LibgdxAtlasPage` (`{ imageFile, size, format, filterMin, filterMag, repeat }`), `LibgdxAtlasRegion` (`{ name, rotate, xy, size, orig, offset, index }`).
  - `parseLibgdxAtlasSpritesheet(text) → SpritesheetData` and `parseLibgdxAtlasSpritesheetDocument(text) → LibgdxAtlasParsed`.
  - `serializeLibgdxAtlasSpritesheet(data, existing?) → string`.
  - Single-page first; multi-page page headers are parsed into `document.pages` but collapsed onto one `imageFile` until the multi-page `SpritesheetData` field lands (Silver). Region `index` (`name` + `index` → `name_index` animation grouping) folded into the existing animation-inference path.
- **Generic grid slicing** — the most common "spritesheet without a descriptor" case, which has no helper at all today.
  - `parseGridSpritesheet(options) → SpritesheetData` taking `Readonly<GridSliceOptions>`: `{ imageFile, imageWidth, imageHeight, columns, rows, frameWidth?, frameHeight?, marginX?, marginY?, spacingX?, spacingY?, namePrefix? }`. Derive `frameWidth/Height` from image size + grid + margin/spacing when not given; emit `name = ${namePrefix}${i}`.
  - `GridSliceOptions` type defined in `@flighthq/types`.
- **Format auto-detection + umbrella dispatcher**.
  - `SpritesheetFormatKind` string-identifier union/registry in `@flighthq/types`: `'texturePacker' | 'aseprite' | 'starling' | 'libgdxAtlas' | …` (PascalCase-valued constants, vendor-prefix convention for custom kinds, last-write-wins registry — mirroring the SDK `*Kind` model).
  - `detectSpritesheetFormat(text) → SpritesheetFormatKind | null` (sentinel `null` on unrecognized input; sniff by leading char / root element / `meta.app` / known keys).
  - `parseSpritesheet(text, formatKind?) → SpritesheetData | null` — dispatch to the detected or supplied parser; `null` when format is unknown (expected failure, not a throw).
- **Real Starling XML parsing + entity handling** — replace the regex parser. Either a small dependency-free XML reader colocated in the package, or harden `parseStarlingXml` against single-quoted attributes, entity-escaped values (`&amp;`/`&quot;`/`&lt;`/`&gt;`), comments, CDATA, and namespaced/extra elements. This is a correctness fix for an "industry-standard format" path, not a stylistic one.
- **Uniform per-format `ParseOptions`** — give Texture Packer and Aseprite an options object symmetric with `StarlingParseOptions`; add `frameDuration` override to Texture Packer (today hard-coded to 100ms, an asymmetry with Starling). Keep the `(data, existing?, options?)` serialize signature.

### Silver

Competitive and solid: matches what a well-regarded atlas-interop library offers — the remaining mainstream formats, multi-page and polygon-trim modeling, and structured diagnostics.

- **Cocos Creator / Cocos2d-x `.plist` atlas** (Apple plist XML).
  - `cocosPlistSchema.ts`: `frames` map with `spriteOffset`, `spriteSourceSize`, `spriteSize`, `textureRect`, `spriteTrimmed`, `textureRotated`; `metadata.textureFileName`, `format` (versions 0–3).
  - `parseCocosPlistSpritesheet` / `parseCocosPlistSpritesheetDocument` / `serializeCocosPlistSpritesheet`. Requires the hardened/real XML reader from Bronze (shared with Starling).
- **Multi-page atlas support** (libGDX, Texture Packer multipack, Phaser 3 multi-pack).
  - New `@flighthq/types` field: replace/extend `imageFile`/`imageWidth`/`imageHeight` with a `pages: SpritesheetPageData[]` model (`{ imageFile, imageWidth, imageHeight }`) and a per-frame `pageIndex`. Keep single-page convenience accessors. This is the central cross-package design item (see Sequencing).
  - Texture Packer `meta.related_multi_packs` follow/emit; `parseTexturePackerMultipack(jsonByFile) → SpritesheetData` consuming a `Record<filename, json>` map.
  - libGDX multi-page page headers fully realized into `pages`.
- **Polygon / mesh trim modeling** (Texture Packer Pixi/Phaser presets: `vertices`, `verticesUV`, `triangles`).
  - New optional `SpritesheetFrameData` field in `@flighthq/types`: `polygon: SpritesheetFramePolygon | null` (`{ vertices, verticesUV, triangles }`). Parse and serialize it for Texture Packer; ignore-but-preserve for formats that lack it via the existing `document` round-trip. Gated so non-mesh consumers tree-shake cleanly. (Coordinate with `@flighthq/sprite` on whether mesh sprites are renderable; if not, model + round-trip only and surface the renderer gap.)
- **Structured parse diagnostics + tolerant mode**.
  - `SpritesheetParseResult` type in `@flighthq/types`: `{ data, diagnostics: SpritesheetParseDiagnostic[] }` where a diagnostic is `{ severity, message, frameName?, field? }`.
  - `parseSpritesheetWithDiagnostics(text, options?) → SpritesheetParseResult`. Per-format `parseFoo` stays the fast, throw-on-malformed-JSON path; the diagnostic variant runs tolerant (skip-bad-frame, report missing `meta.size`, report unknown direction). Expected-failure cases return diagnostics + best-effort data; only genuine API misuse throws.
- **Animation direction normalization** — validate/normalize `frameTags` direction values (`forward`/`reverse`/`pingpong`/`pingpong_reverse`) against `SpritesheetAnimationDirection`; map vendor spellings; emit a diagnostic for unrecognized values rather than passing garbage to the animator. Normalize reverse-range frame ordering.
- **Starling image-dimension supply/inference** — `StarlingParseOptions.imageWidth/imageHeight` so consumers can populate the dimensions Starling genuinely omits, instead of always-0. Same option for any other dimensionless format.
- **Plist serialize fidelity + Aseprite layer/tag-color modeling** — promote the currently document-only Aseprite `layers` and tag `color` into typed (optional) `SpritesheetData` fields where the renderer can use them, rather than surviving only through the opaque `existing` document.

### Gold

Authoritative / AAA: exhaustive format coverage, a registry seam, performance, full error handling, and 1:1 Rust-port parity.

- **Remaining recognized formats** to close the long tail:
  - **Unity sprite-atlas / sprite-sheet metadata** (`.meta` sprite rects) — `parseUnitySpriteSheet*`.
  - **Godot `.tres` AtlasTexture / SpriteFrames** — `parseGodotAtlas*`.
  - **Spine `.skel`/`.json` region attachment atlas linkage** (region names only; full skeletal animation stays out of scope — surface as a `@flighthq/spine` suggestion).
  - **Adobe Animate / EaselJS spritesheet JSON**, **Phaser legacy XML/JSON Array hash variants**, **Kenney/GUI generic CSV grid**.
- **Pluggable format registry seam** — `registerSpritesheetFormat(kind, { detect, parse, serialize })` and `getSpritesheetFormat(kind)`, so third parties add formats without forking the package. `parseSpritesheet`/`detectSpritesheetFormat` consult the registry. Keep registration opt-in (no top-level side effects); built-ins exposed via explicit `register*` helpers. This is the `*Backend`-style seam adapted to format plugins.
- **Binary format support** — Aseprite native `.ase`/`.aseprite` binary reader (frames, tags, layers, slices, palettes) as an opt-in subpath-free module; `parseAsepriteBinarySpritesheet(bytes: Readonly<Uint8Array>)`. Largest single Gold effort.
- **Exhaustive edge-case + error handling** — empty atlases, zero-size frames, duplicate frame names, out-of-range `frameTags`, mixed rotated/trimmed flags, NaN/locale-formatted numbers, BOM-prefixed/CRLF text, oversized files; every expected failure returns a diagnostic, never a throw. Property-based round-trip tests (`parse∘serialize∘parse` is stable) per format.
- **Performance & allocation discipline** — streaming/lazy frame iteration for very large atlases; reuse of frame arrays via `out`-parameter parse variants (`parseTexturePackerSpritesheetInto(json, out)`); benchmark gate. No per-frame regex in any hot path.
- **Docs & examples** — a format-support matrix doc, a round-trip example, and a `tools/functional` scene that loads each format and renders the resulting spritesheet across backends for visual parity.
- **1:1 Rust-port parity** (`flighthq-spritesheet-formats` crate, already scaffolded with `aseprite`/`starling`/`texture_packer` modules). Mirror every TS addition: `libgdx_atlas`, `cocos_plist`, grid slicing, `detect_spritesheet_format`, `parse_spritesheet`, multi-page + polygon + diagnostics types, binary aseprite. Conformance-tested against the TS parsers on shared fixtures (assertion-ported unit tests + the parity differ); record any intentional TS↔Rust divergence in the conformance map. As a value-in/value-out leaf (text → plain `SpritesheetData`), this crate is a strong **mixing** candidate (wasm drop-in), so keep its seam plain-data.

## Sequencing & effort

**Recommended order**

1. **Bronze, in order**: libGDX `.atlas` (single-page) → grid slicing → format detection + `parseSpritesheet` dispatcher → real/hardened Starling XML reader → uniform per-format `ParseOptions`. libGDX and grid slicing deliver the most value per unit effort and need no type changes; detection depends on the new `SpritesheetFormatKind` (small `@flighthq/types` add). The XML reader is reusable infrastructure that Cocos `.plist` (Silver) also needs, so doing it in Bronze pays twice.
2. **Silver type work first, then formats**: land the multi-page (`pages` + `pageIndex`), polygon (`polygon`), and diagnostics (`SpritesheetParseResult`) **types in `@flighthq/types`** before the parsers that emit them. Then Cocos `.plist` → multipack → polygon trim → diagnostics/tolerant mode → direction normalization.
3. **Gold**: registry seam → remaining text formats → binary aseprite → perf/`out`-param variants → docs/functional scene → Rust parity (mirror in lockstep once each TS format stabilizes).

**Cross-package / design-decision items to surface**

- **Move the `Spritesheet*Data` triple into `@flighthq/types`** (currently in `@flighthq/spritesheet`). Required by the header-layer rule before adding `pages`, `polygon`, `pageIndex`, `SpritesheetFormatKind`, or `SpritesheetParseResult`. Crosses into `@flighthq/spritesheet`; raise as a question before acting, since it re-homes that package's public types.
- **Multi-page `SpritesheetData` shape** is the pivotal model decision: a `pages[]` array changes `imageFile`/`imageWidth`/`imageHeight` consumers across `@flighthq/spritesheet` and `@flighthq/sprite`. Decide single-page-convenience vs. always-array before libGDX multi-page or multipack.
- **Mesh/polygon renderability** depends on `@flighthq/sprite` (does the sprite/quad-batch renderer support mesh-trimmed sprites?). If not, model + round-trip the polygon data but surface the renderer gap as a suggestion rather than building mesh rendering here.
- **Aseprite binary `.ase`** is the only Gold item with real parsing weight (chunked binary, palettes, slices) and should be scoped/timeboxed separately; everything else in Gold is additive text work.
- **Rust crate already exists** (`crates/flighthq-spritesheet-formats`, three modules scaffolded) — parity is mirror-and-conform, not greenfield, but every TS addition incurs a matching Rust task and a conformance-fixture pair. Keep the crate's seam plain-data so it stays a `surface`-style mixing candidate.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/spritesheet-formats` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
