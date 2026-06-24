---
package: '@flighthq/resources'
updated: 2026-06-24
basedOn: ./review.md
---

# resources — Assessment

> Recommendation layer over `review.md`. Sorts the surveyed gaps + the prior maturation roadmap (`reviews/maturation/depth/resources.md`, now absorbed) into sweep-safe `Recommended` and parked `Backlog`. `Approved` is the user's verbal gate — left empty. See ../CONTRACT.md.

The governing context: the register records a **blessed standing direction that `resources` should dissolve into per-subject triads** (`image` / `audio` / `video` / `font` / `textureatlas` / `tileset`), with `TextureAtlas` explicitly recorded as _mis-homed_ here. That makes almost every feature, format, and structural item from the roadmap **cross-package or design-gated** — each lands in a different subject home depending on a decision the charter has not yet made. `Recommended` is therefore deliberately narrow: only the two verified within-package defects, which are correct under _any_ future home. Everything else is parked with its blocking reason, and the package-shape / fire-and-forget / cache / page-model / compressed-texture questions are routed to the charter's Open directions (the charter is a stub — North star and Boundaries are still `TODO`).

## Recommended

Sweep-safe: within `@flighthq/resources` (plus its `@flighthq/types` header), no cross-package coupling, no breaking change, no open design decision. Both are correctness fixes that hold under any future home for the atlas/tileset subject.

- **Fix `setTextureAtlasRegion` pivot defaults to honor the `null` convention.** `textureAtlasRegion.ts:162-177` still declares `pivotX: number = 0, pivotY: number = 0` and writes them unconditionally, contradicting the pass-2 decision that `createTextureAtlasRegion` defaults pivots to `null` ("no pivot" ≠ "pivot at 0,0"). Reusing a region via `setTextureAtlasRegion` re-stamps `0`, re-introducing exactly the conflation the pass removed — and because `buildTilesetRegions` calls it per tile, every pooled tileset region gets `pivot = 0`. Align the setter's defaults/handling with the constructor (`pivotX ?? null`). Verified defect; restores an already-decided in-package convention. — review.md#defects (1)

- **Make `buildTilesetRegions` truncate `atlas.regions` to the new tile count.** `tileset.ts:10-23` reuses/pushes up to `rows*columns` regions but never sets `atlas.regions.length = rows*columns` after the loop, so rebuilding a previously-larger tileset leaves stale trailing regions. The reuse-in-place optimization is sound; only the final truncation is missing. Add a colocated alias-safe test for the shrink case. Verified defect, within-package. — review.md#defects (2)

## Backlog

Parked: each is cross-package, a real design decision, breaking, or blocked on an Open direction. The dominant blocker for the feature/format items is the **dissolution direction** — each gap is cheaper to design _after_ the charter decides whether `resources` is a durable grab-bag or a staging area to be decomposed, because each lands in a different subject home.

- **`load*FontResource*` out-first / async ordering asymmetry.** `loadFontResourceFromUrl(out, url)` places the mutable target _first_ (convention is `out`/`target` last) and is the only `load*` family that mutates-in-place rather than allocating. _Parked:_ this is a public-API-shape decision — align ordering, or reconsider whether the out-into-existing variant should exist alongside the allocating `loadFontFrom*` at all — not a clean sweep. Surfaced to the charter's Open directions. — review.md#contract-fit-drift

- **Fire-and-forget failure semantics.** `createAudioResourceFromUrl` swallows fetch/decode failure with `.catch(() => {})` and returns a silently-empty resource. _Parked:_ whether the non-`load` constructors _should_ fail observably (signal/sentinel) is an intended-contract decision (Open direction #5), and the natural fix (a signal group) couples to the loader-signal work below.

- **Resource cache / dedup registry.** No content-addressed identity; loading the same URL twice fetches twice. _Parked — cross-package:_ ownership is undecided between `resources` (content-addressed identity) and `@flighthq/loader` (batch lifecycle). Open direction #2; blocks the loader-signal work too.

- **Loader signals via `enableResourceLoaderSignals`.** The `ResourceLoader` type gestures at `onComplete`/`onError`/`onProgress` but is unwired. _Parked:_ depends on the cache/loader ownership decision above and on the fire-and-forget semantics; an opt-in signal group is the right shape once those settle.

- **Multi-page atlas (`pages: ImageResource[]` + per-region `page`).** Single-`image` cannot represent libGDX/large-TexturePacker exports. _Parked — cross-package structural:_ changes the `TextureAtlas`/`TextureAtlasRegion` header shape and ripples into `sprite`, `spritesheet`, and renderers (Open direction #3). Settle before any format parser proliferates against the single-page assumption.

- **Animation metadata on the atlas (`animations: TextureAtlasAnimation[]`).** Aseprite/TexturePacker frame-tags are dropped; `getTextureAtlasRegionSequence`'s name-prefix scan is a workaround. _Parked — cross-package + home decision:_ feeds `spritesheet`/`timeline-spritesheet`, and whether parsed-tag fidelity is first-class or stays a naming convention couples to whether atlas data even stays in `resources` (Open direction #4).

- **Per-tile metadata + Tiled tileset/tilemap ingestion.** No `tiles: TilesetTile[]` (id/properties/animation/collision); `.tsx`/`.tsj`/`.tmx`/`.tmj` parsing out of reach. _Parked:_ the parsers belong in the `-formats` triad layer (the register's `resource-formats` → `textureatlas-formats`/tileset destination), i.e. a separate cell, and per-tile _types_ land in whatever subject home the dissolution gives `tileset`. Cross-package.

- **Compressed-texture path (KTX2 / Basis / DDS + transcoder backend seam).** No `CompressedPixelFormat`, no `compressed` slot, no swappable Basis transcoder. _Parked:_ genuine Gold-tier scope question (Open direction #6) plus the one place a `npm run size` bundle gate bites — the transcoder wasm must stay off the default bundle. Cross-package types + backend seam.

- **Package Map + Rust-crate revisions.** `index.md` still calls `resources` the home for "texture atlases" without noting the `-formats` redirect, and the charter's `crate: flighthq-resources` presupposes a single crate the dissolution may not want. _Parked — not code:_ admin-doc and conformance-map edits that are blocked on the dissolution direction landing first.

- **The dissolution itself — dissolve `resources` into per-subject triads, or keep it a grab-bag?** _Parked — design fork._ This is the dominant question and is not in-package work; it is a charter Boundary/North-star decision (and aligns with structural-forks "grab-bags are fused primitive-layers"). Routed to the charter's Open directions, where it gates the home of every feature item above. Not actioned autonomously.

## Approved

_None. Frozen on the user's verbal approval only._
