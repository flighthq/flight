---
id: atlas-packer
title: '@flighthq/atlas-packer'
type: new-package
target: atlas-packer
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/atlas-packer.md
  - tools/agents/docs/reviews/breadth/asset-pipeline.md
depends_on: []
updated: 2026-06-23
---

## Summary

Runtime bin-packing that builds a `TextureAtlas`/`Tileset` from loose regions (MaxRects / Guillotine / Skyline), with rotation, padding, and extrude, feeding glyph atlases and dynamic content.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable runtime packer: one good heuristic, fixed-size sheet, and a path straight into `TextureAtlas`.

- **Types in `@flighthq/types`:**
  - `AtlasPackInput` — `{ id: number; width: number; height: number; allowRotation: boolean }` (a loose region request; `id` round-trips to `TextureAtlasRegion.id`).
  - `AtlasPackPlacement` — `{ id: number; x: number; y: number; width: number; height: number; rotated: boolean }` (result for one input).
  - `AtlasPackResult` — `{ placements: AtlasPackPlacement[]; unpacked: number[]; width: number; height: number; usedArea: number }` (`unpacked` = ids that did not fit; `usedArea` for occupancy reporting).
  - `AtlasPackOptions` — `{ width: number; height: number; padding: number; allowRotation: boolean; heuristic: AtlasPackHeuristicKind }`.
  - `AtlasPackHeuristicKind` — string `*Kind` identifier; Bronze ships `'MaxRectsBestAreaFit'`.
- **`@flighthq/atlas-packer`:**
  - `createAtlasPackOptions(obj?: Partial<AtlasPackOptions>): AtlasPackOptions` — constructor with sane defaults (padding 0, no rotation, MaxRects).
  - `packAtlasRegions(inputs: Readonly<AtlasPackInput[]>, options: Readonly<AtlasPackOptions>): AtlasPackResult` — one-shot pack into a fixed `width × height`; returns placements + `unpacked` (sentinel-style: overflow reported in `unpacked`, never throws).
  - `MaxRectsBestAreaFitKind` — the one heuristic constant, registered in a string keyed map so Silver can add siblings without changing the call shape.
  - `applyAtlasPackResult(target: TextureAtlas, result: Readonly<AtlasPackResult>): void` — writes placements into `target.regions` as `TextureAtlasRegion`s (using `resources` constructors, not literals), so the descriptor layer consumes the layout directly.
- **Effort:** ~1 sentence of glue + one solid MaxRects implementation. The 80/20: dynamic atlases work, glyph atlas has a home, fixed sheet covers most cases.

### Silver

Competitive with a well-regarded packer (rectpack2D / TexturePacker core): multiple heuristics, auto-grow, padding/extrude, rotation, and real pixel compositing.

- **Types in `@flighthq/types`:**
  - Extend `AtlasPackHeuristicKind` constants: `'MaxRectsBestShortSideFit'`, `'MaxRectsBestLongSideFit'`, `'MaxRectsBottomLeft'`, `'MaxRectsContactPoint'`, `'GuillotineBestAreaFit'`, `'SkylineBottomLeft'`, `'SkylineMinWaste'`.
  - `AtlasPackSizeConstraint` — `{ maxWidth: number; maxHeight: number; powerOfTwo: boolean; square: boolean; growStep: number }` for auto-sizing.
  - Extend `AtlasPackOptions` with `extrude: number` (edge bleed), `border: number` (sheet margin), `sort: AtlasPackSortKind`, and an optional `sizeConstraint: AtlasPackSizeConstraint | null`.
  - `AtlasPackSortKind` — `'Area' | 'MaxSide' | 'Height' | 'Width' | 'Perimeter' | 'None'` as string kinds.
  - `AtlasCompositeSource` — `{ id: number; image: ImageResource; sourceX: number; sourceY: number }` (maps a placement back to pixels for compositing).
- **`@flighthq/atlas-packer`:**
  - `packAtlasRegionsAutoSize(inputs, options, constraint): AtlasPackResult` — grow the sheet (respecting power-of-two / square / max bounds and `growStep`) until everything fits or the cap is hit; `unpacked` reports the remainder.
  - `estimateAtlasPackSize(inputs, options): { width: number; height: number }` — area-based starting-size guess so callers avoid a too-small first attempt.
  - `getAtlasPackOccupancy(result: Readonly<AtlasPackResult>): number` — packed-area / sheet-area ratio for quality reporting.
  - `sortAtlasPackInputs(inputs, sort, out): void` — `out`-param, alias-safe ordering pass (callers can pre-sort or let `pack*` do it).
  - **Compositing (uses `@flighthq/surface`):**
    - `compositeAtlasSurface(target: Surface, sources: Readonly<AtlasCompositeSource[]>, result: Readonly<AtlasPackResult>, options): void` — blits each source into its placement, honoring rotation, `padding`, and `extrude` (edge-pixel bleed to kill bilinear seams).
    - `buildTextureAtlasFromImages(images: Readonly<ImageResource[]>, options): { atlas: TextureAtlas; surface: Surface; unpacked: number[] }` — the end-to-end convenience: measure → pack → composite → emit a `TextureAtlas` over the packed `Surface`.
    - `buildTilesetFromImages(images, tileWidth, tileHeight, options): { tileset: Tileset; ... }` — same flow emitting a uniform `Tileset`.
  - **Rotation:** all heuristics honor `allowRotation` per-input; `AtlasPackPlacement.rotated` and compositing apply the 90° transform consistently (one rotation convention, documented).
- **Cross-backend consistency:** packing is CPU-only and identical across backends; the compositing step writes a `Surface` that any renderer uploads — no per-backend packer variant.
- **Effort:** the heuristic family + auto-grow is the bulk; extrude/rotation compositing is fiddly but bounded. This is the tier that makes it "use it in production for asset builds and runtime glyph atlases."

### Gold

Authoritative reference: incremental/online packing, repack, allocation discipline, full edge-case handling, exhaustive tests, docs, and Rust parity.

- **Types in `@flighthq/types`:**
  - `AtlasPacker` (Entity) + `AtlasPackerRuntime` — a _stateful_ online packer holding a Skyline/MaxRects free-list for incremental insertion (the dynamic-glyph-atlas case: add glyphs as they're shaped without repacking the world).
  - `AtlasPackerStats` — `{ insertCount; rejectCount; growCount; occupancy; fragmentation }`.
  - `AtlasShelf` / free-rectangle internal descriptors (runtime-only; not exported as public literals).
- **`@flighthq/atlas-packer`:**
  - **Incremental API:** `createAtlasPacker(options): AtlasPacker`, `insertAtlasPackerRegion(packer, input, out: AtlasPackPlacement): boolean` (returns `false` when it doesn't fit — sentinel, no throw), `growAtlasPacker(packer, width, height): boolean`, `resetAtlasPacker(packer): void`, `getAtlasPackerStats(packer, out): void`, `disposeAtlasPacker(packer): void` (release-to-GC; `destroy*` not needed — no non-GC resource owned).
  - **Repack:** `repackAtlas(packer): AtlasPackResult` — defragment a live atlas (e.g. after many evictions), and `enableAtlasPackerSignals(packer)` exposing `onAtlasGrow` / `onAtlasRepack` for consumers (text glyph cache) that must re-upload the GPU texture and re-map UVs.
  - **Pooling / allocation discipline:** `acquireAtlasPackResult()` / `releaseAtlasPackResult(result)` paired pool brackets; all hot-path geometry via `out`-params and `@flighthq/geometry` pools — zero per-insert allocation in the steady state.
  - **Full heuristic coverage:** the complete MaxRects/Guillotine/Skyline matrix plus Guillotine split rules (`'ShorterLeftoverAxis'`, `'LongerLeftoverAxis'`, `'MinArea'`, `'MaxArea'`) and free-rect merge, matching rectpack2D/jsdom-free reference behavior.
  - **Edge cases:** zero-size inputs, single oversized input (reported in `unpacked`, never an infinite grow loop), degenerate padding/extrude vs sheet size, `powerOfTwo` + `square` interaction, max-bound exhaustion, duplicate ids.
  - **Quality knobs:** `discardOnOverflow` vs partial-pack reporting; `trim` to compute the minimal bounding sheet after a pack (tight output for build-time atlasing).
- **Tests:** colocated `*.test.ts` per file; occupancy/regression fingerprints over canonical input sets so heuristic changes are visible; `out`-aliasing tests for every `out`-param fn; overflow/sentinel paths asserted.
- **Rust parity:** `flighthq-atlas-packer` is a 1:1 conformant value-typed leaf — same heuristics, same placement output, bit-deterministic across machines; on the conformance path as a mixable crate (`atlas-packer-rs` shim potential). Layout determinism is the property the parity differ checks; compositing parity flows through the existing `surface` conformance.
- **Docs:** heuristic-selection guidance, the rotation/extrude conventions, and the online-vs-one-shot decision.

## Boundaries

- **Pixel codecs and decode stay out** — decoding PNG/JPEG/WebP into an `ImageResource`/`Surface` belongs to `@flighthq/resources` and the requested `@flighthq/image-codec` seam, not here. The packer consumes already-decoded `ImageResource`/`Surface`.
- **GPU upload stays out** — turning the packed `Surface` into a texture is the renderer packages' job (`displayobject-gl`/`-wgpu` texture entries, render caches). The packer stops at a CPU `Surface`.
- **Interchange parsing stays in `spritesheet-formats`** — TexturePacker/Aseprite/Starling atlas _files_ are already parsed there. This package _produces_ layouts; it does not re-implement those parsers. A `-formats` neighbor only appears for packer-_config_ artifacts, if ever.
- **Glyph rasterization stays in the text stack** — `textshaper`/`textlayout` produce glyph bitmaps; atlas-packer only _places_ them. It is a consumer-agnostic rectangle packer, not a font tool.
- **Asset caching / dedup stays out** — the requested `@flighthq/assetcache` owns load-once/ref-count/eviction. The online `AtlasPacker` manages _space within one sheet_, not _which assets are resident_.
- **Filters/effects stay out** — extrude/padding bleed is a deterministic edge-copy, not a filter; `filters`/`effects` are unrelated.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **One-shot vs. online as the primary shape.** Bronze ships the pure `packAtlasRegions` function; Gold adds the stateful `AtlasPacker`. Should the stateful packer be the canonical API with one-shot as a thin wrapper, or kept as two clearly separate tiers? The glyph-atlas use case strongly wants the online packer early — consider promoting it to Silver.
- **Where compositing lives.** `compositeAtlasSurface` depends on `@flighthq/surface`. Is a `surface` dependency acceptable in this package, or should compositing move to a `atlas-packer` ↔ `surface` bridge (or into `surface` itself as `surfaceAtlasComposite`) to keep `atlas-packer` a pure-geometry, surface-free leaf and maximize mixability? Recommendation: keep layout surface-free; gate compositing behind its own importable functions so geometry-only users don't pull `surface`.
- **Rotation convention.** Clockwise vs counter-clockwise 90° and the resulting UV/pivot mapping must match whatever `sprite`/tilemap rendering expects. Needs to be fixed once and documented, mirrored in Rust.
- **`-formats` neighbor necessity.** Is there a real packer-config artifact worth a `@flighthq/atlas-packer-formats` (e.g. `.tps`), or does that duplicate `spritesheet-formats`? Lean toward _no neighbor_ unless a concrete config format earns it.
- **Power-of-two / square defaults.** Native (wgpu) and modern WebGL2 don't require POT; should `powerOfTwo` default off, with POT/square as opt-in build-time constraints? Recommendation: default off, opt-in via `AtlasPackSizeConstraint`.
- **Interaction with `@flighthq/assetcache` eviction.** When the asset cache evicts a region from a live online atlas, who triggers `repackAtlas` / hole reuse — the cache, or a signal from the packer? Surface as a cross-package design decision rather than deciding it here.

## Agent brief

> Create `@flighthq/atlas-packer` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
