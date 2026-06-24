---
package: '@flighthq/resources'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch (builder-67dc46d64)
---

# resources — Review

> Survey layer. Evidence read from the incoming bundle `incoming/builder-67dc46d64/head/packages/resources/` and `changes.patch`. The prior depth review (`reviews/depth/resources.md`) no longer exists as a file; its content is the `status.md` "previous score 76/100" baseline, which this review absorbs and supersedes.

## Verdict

`solid` — **82/100**. The core resource descriptor + loader layer is mature, symmetric, and well-tested (163 tests across 15 files, count verified against source). The pass-2 atlas-region additions are clean and correct. Two real consistency defects survive (`setTextureAtlasRegion` pivot defaults, `buildTilesetRegions` shrink), and the package's _shape_ is the larger open question: the register has a blessed direction that `resources` should **dissolve into per-subject triads**, and `TextureAtlas` is recorded as _mis-homed_ here. The status doc's 91/100 self-estimate overcounts because it scores the `resource-formats` neighbor (a separate package, its own cell) into the `resources` total and does not weigh the dissolution direction.

## Present capabilities (grounded in source)

All claims below were checked against `head/packages/resources/src/` and the realized `dist/*.d.ts`.

**Image resources** (`imageResource.ts`, `imageResourceFrom.ts`) — `createImageResource`, `cloneImageResource` (documented as sharing pixels by reference — a precise ownership comment), `disposeImageResource` (correctly `dispose*`: releases element/data refs to GC, explicitly does _not_ free the GPU texture or close an owned `ImageBitmap`), `setImageResourceSource`, `invalidateImageResource` (version bump, `>>> 0` wrap), `hasImageResourceData`, `hasImageResourceSource`, `isImageResourceEmpty`, `getImageResourceByteSize` (data byteLength or 0; doc notes the GPU footprint is render-state-owned). Loaders: from URL / Blob / Base64 / ArrayBuffer, plus `detectImageMimeType`, `isImageResourceSameOrigin`, and three element constructors. All four async loaders thread `AbortSignal`.

**Texture atlas** (`textureAtlas.ts`, `textureAtlasFrom.ts`, `textureAtlasRegion.ts`) — `createTextureAtlas`, `getTextureAtlasByteSize` (delegates to image byte size). Region API is the richest surface: `createTextureAtlasRegion`, four `addTextureAtlasRegion*` overloads (scalar, Rectangle, RectangleXY, Vector2), `setTextureAtlasRegion`, lookups `getTextureAtlasRegionById` / `getTextureAtlasRegionByName` (linear scan, doc-noted acceptable < 2000 regions), `getTextureAtlasRegionSequence` (name-prefix collection for animation frames), and `getTextureAtlasRegionUv` (normalized UV into `out`; zero-fills on non-positive image dims; alias-safe — reads all inputs into locals before writing, comment present). Eight `loadTextureAtlas*` loaders with `AbortSignal`.

**Tileset** (`tileset.ts`, `tilesetFrom.ts`) — `createTileset` (defaults `margin`/`spacing` to 0), `buildTilesetRegions` (honors margin border + inter-tile spacing in the grid layout), `createTilesetFromAtlas` / `createTilesetFromImageResource` (optional `margin`/`spacing`), four `loadTileset*` loaders with `AbortSignal`.

**Audio / video / font** — `createAudioResource`, `getAudioContext`, `createAudioResourceFrom{Url,Urls}` and `loadAudioResourceFrom{Url,Urls}` (signal-threaded; `*Urls` does `canPlayType` source selection with extension fallback). Video mirror is symmetric, with the non-async `loadVideoResourceFromUrl` correctly using `if (signal?.aborted) return Promise.reject(signal.reason)` and wiring `abort` → cleanup + `element.src = ''`. Fonts: `createFont`/`createFontResource`, `loadFontFrom{ArrayBuffer,Name,Url,Urls}` (allocating), and `loadFontResourceFrom{ArrayBuffer,Name,Url,Urls}` (out-into-existing). URL-casing cleanup landed (`*FromUrls`, not `*FromURLs`) — verified in `dist`.

**Types** (`@flighthq/types`) — `TextureAtlasRegion` carries the full pack-tool field set (`name`, `trimmed`, `rotated`, `sourceX/Y`, `originalWidth/Height`, `pivotX/Y: number | null`) with accurate per-field doc comments; `Tileset` carries `margin`/`spacing` with corrected Tiled-terminology docs; `TextureAtlasFormatKind` is a new string-kind family (one-concept-per-file, vendor-prefix convention documented). These are model citizens of the types-layout convention.

## Gaps

What a mature asset-resource library has that this one lacks:

- **No resource cache / dedup registry.** No `getCachedResource` / content-addressed identity. Loading the same URL twice fetches twice. Status defers this pending a `resources`↔`loader` ownership decision.
- **No loader-signal opt-in.** `enableResourceLoaderSignals` is gestured at in the `ResourceLoader` type but unwired; progress/error notification is absent from this package.
- **Single-page atlases only.** `TextureAtlas.image: ImageResource | null` cannot represent a multi-page atlas (libGDX/TexturePacker emit these); a structural change to `pages: ImageResource[]` + per-region `page` is deferred as cross-package.
- **No animation metadata on the atlas.** Frame-tag/animation data from Aseprite/TexturePacker is dropped; the `getTextureAtlasRegionSequence` name-prefix approach is a workaround, not parsed-tag fidelity.
- **No per-tile metadata.** `Tileset` has no `tiles: TilesetTile[]` (id/properties/animation/collision), so tile properties and tilemap-layer ingestion (`.tmx`/`.tmj`) are out of reach.
- **No compressed-texture path.** No `CompressedPixelFormat` / KTX2 / Basis / DDS / transcoder seam — genuine Gold-tier work, and the one place a wasm-bundle-size gate would bite.
- **Audio decode is unguardable.** `createAudioResourceFromUrl` swallows fetch/decode failure with `.catch(() => {})` and returns a silently-empty resource — no signal, no sentinel a caller can observe. (The `load*` async variants surface rejection; the fire-and-forget `create*` ones do not, which is a defensible split but worth noting.)

## Defects (verified against source)

1. **`setTextureAtlasRegion` pivot defaults contradict the new `null` convention.** Pass 2 deliberately changed `createTextureAtlasRegion` to default `pivotX`/`pivotY` to `null` (so "no pivot" ≠ "pivot at 0,0"), and `addTextureAtlasRegion` passes `pivotX ?? null`. But `setTextureAtlasRegion` (textureAtlasRegion.ts:162-177) still has `pivotX: number = 0, pivotY: number = 0` and writes them unconditionally. Reusing a region via `setTextureAtlasRegion` therefore stamps `0` where the constructor would write `null`, re-introducing exactly the conflation the pass set out to remove. `buildTilesetRegions` calls `setTextureAtlasRegion` for every tile, so every pooled tileset region gets `pivot = 0`, not `null`.

2. **`buildTilesetRegions` does not shrink `atlas.regions` when the grid gets smaller.** It reuses/pushes up to `rows*columns` regions (tileset.ts:10-23) but never truncates `atlas.regions.length` to the new tile count. Rebuilding a previously-larger tileset leaves stale trailing regions in the atlas. The reuse-in-place optimization is sound; the missing `atlas.regions.length = rows*columns` after the loop is the bug.

## Charter contradictions

The charter (`charter.md`) is a stub — North star, Boundaries, Decisions, and Open directions are all `TODO`. There is therefore **no stated principle for the code to contradict**. The substantive tension is against an SDK-wide _structural fork_, not against this charter; see Candidate open directions.

## Contract & docs fit

**Lives up to the contract — strongly:**

- Types-first: every cross-package type (`TextureAtlasRegion`, `Tileset`, `TextureAtlasFormatKind`, `*Resource`) lives in `@flighthq/types`, one concept per file, with the entity/`*Like` split. Implementation imports them.
- Full unabbreviated names throughout; globally self-identifying (`getTextureAtlasRegionUv`, `getImageResourceByteSize`).
- Sentinels-not-throws: lookups return `null`; UV zero-fills rather than dividing by zero. No error-wrapping types.
- `out`-param + alias-safety: `getTextureAtlasRegionUv` reads inputs into locals first, with the comment.
- Teardown verb: `disposeImageResource` is correctly `dispose*` (GC release, not GPU free) — the doc spells out precisely what it does and does not release.
- Single root `.` export, `"sideEffects": false`, alphabetized exports.

**Contract-fit drift / candidate revisions:**

- **`load*FontResource*` put `out` first and are `async`.** `loadFontResourceFromUrl(out, url)` etc. place the mutable target as the _first_ parameter, whereas the codebase convention is the mutable output last, named `out`/`target`. They are also the only `load*` functions in the package that mutate-in-place rather than allocate — every other `load*` returns a fresh resource. This asymmetry (allocating `loadFontFrom*` vs. out-first `loadFontResourceFrom*`) is worth a deliberate look: either align ordering, or reconsider whether the out-into-existing variant should exist alongside the allocating one.
- **Package Map line is now imprecise about the formats split.** `index.md` still describes `resources` as the home for "texture atlases" without noting that atlas _parsing_ now lives in the `resource-formats` neighbor and that the register has redirected that neighbor to `textureatlas-formats` pending extraction. The map line is a candidate revision once the dissolution direction is settled.
- **Rust mirror:** charter declares `crate: flighthq-resources`. Given the blessed dissolution direction, whether a single `flighthq-resources` crate should exist at all (vs. per-subject crates) is itself an open question the conformance map will need to record.

## Candidate open directions

The charter is silent on all of these; each is something this review had to assume or work around.

1. **The package's own shape — dissolve into per-subject triads?** This is the dominant question. The register (`packages/register.md`) records a _standing decomposition direction_: "`resources` → dissolve into per-subject triads … it fuses the data-primitive layer of six subjects" (`image` / `audio` / `video` / `font` / `textureatlas` / `tileset`), and the `resource-formats` redirect verdict is explicit that "the duplication is a _symptom_ of `TextureAtlas` being mis-homed in `resources`." Maturing `resources` _as a grab-bag_ (the path this bundle is on) and dissolving it are opposite directions. The charter must take a position: is `resources` a durable grab-bag, or a staging area to be decomposed? Every gap below (multi-page atlas, per-tile metadata, cache) is cheaper to design _after_ this is settled, since each lands in a different subject home.
2. **Cache ownership: `resources` vs. `loader`.** Does URL-keyed dedup/content-addressing live here (available to standalone loaders) or in `@flighthq/loader` (lifecycle-tied to the batch queue)? Blocks both the cache and the loader-signal work.
3. **Atlas page model.** Is single-page `image` the permanent shape, or is multi-page (`pages[]` + per-region `page`) in scope? Ripples into `sprite`, `spritesheet`, and renderers.
4. **Animation-metadata home.** Should parsed frame-tags become a first-class `animations: TextureAtlasAnimation[]` on `TextureAtlas`, or stay a name-prefix convention? Couples to whether atlas data stays in `resources`.
5. **Fire-and-forget failure semantics.** Is `createAudioResourceFromUrl`'s silent `.catch(() => {})` the intended contract for the non-`load` constructors, or should failure be observable (signal/sentinel)?
6. **Compressed-texture scope and the bundle gate.** Whether KTX2/Basis/DDS + a transcoder backend are in scope — and if so, the `npm run size` discipline that keeps the transcoder wasm off the default bundle.
