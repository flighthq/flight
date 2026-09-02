---
package: '@flighthq/textureatlas'
status: solid
score: 70
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# textureatlas — Review

**Domain:** Texture atlas entity layer for a graphics SDK — creating `TextureAtlas` entities (an image-backed `Texture2D` plus an array of `TextureAtlasRegion` entries), querying and manipulating regions by id, name, prefix sequence, and ordinal, computing UVs and trim-placement frames, and constructing atlases from various image sources.

**Verdict:** solid — 70/100

The package has matured substantially since the prior review (2026-07-03, score 45). Every gap the previous survey identified in region management, draw-placement math, indexed lookup, ordinal queries, teardown, and counting has been addressed. The core is now comprehensive for single-page atlases: 36 public exports across 5 source files, 122 test cases, thorough alias-safety, correct `out`-parameter conventions, sentinel returns, diagnostics following the inversion rule, and a guards layer with `explain*`/`enable*` pairing. What holds it back from authoritative is the structural single-page limitation (the largest gap for production atlas workflows) and the absence of nine-slice metadata.

## Present capabilities

### Entity lifecycle

- `createTextureAtlas(obj?)` — entity with `texture: Texture2D | null` and `regions: TextureAtlasRegion[]`, defaults null/empty. (`textureAtlas.ts:5`)
- `disposeTextureAtlas(atlas)` — drops regions and texture reference, documented as not destroying the texture the caller supplied; idempotent. (`textureAtlas.ts:16`)
- `getTextureAtlasByteSize(atlas)` — CPU-side byte footprint of the texture source, 0-sentinel when null or element-only, handles both `Bitmap` and `CompressedImage` kinds. (`textureAtlas.ts:23`)

### Construction from image sources

- Synchronous: `createTextureAtlasFromCanvas`, `createTextureAtlasFromImageBitmap`, `createTextureAtlasFromImageElement`, `createTextureAtlasFromImageResource`. All four route through `createTextureAtlasFromImageResource`, which wraps the image in a `Texture2D` via `createTexture`. (`textureAtlasFrom.ts:15-35`)
- Async: `loadTextureAtlasFromBase64`, `loadTextureAtlasFromBlob`, `loadTextureAtlasFromBytes`, `loadTextureAtlasFromUrl` — each delegates to the corresponding `@flighthq/image` loader then wraps the result. `AbortSignal` threaded throughout. (`textureAtlasFrom.ts:37-63`)

### Grid slicing

- `createTextureAtlasFromGrid(options, texture?)` — builds row-major regions for a regular grid with per-axis margins, spacing, optional explicit frame dimensions, and a configurable name prefix. Region ids are sequential starting at 0. (`textureAtlasGrid.ts:9`)

### Region creation and management

- `createTextureAtlasRegion(obj?)` — entity with 14 fields, all defaulted (id defaults to -1, pivot fields to null, rotated/trimmed to false). (`textureAtlasRegion.ts:120`)
- `addTextureAtlasRegion(target, x, y, w, h, pivotX?, pivotY?, name?)` — appends with a high-water-mark id that never collides with existing ids and never reuses a removed id. (`textureAtlasRegion.ts:22`)
- `addTextureAtlasRegionCorners` — two-corner (ax,ay,bx,by) variant. (`textureAtlasRegion.ts:49`)
- `addTextureAtlasRegionRectangle` — `RectangleLike` + optional `Vector2Like` pivot. (`textureAtlasRegion.ts:62`)
- `addTextureAtlasRegionVector2` — two `Vector2Like` corners + optional pivot. (`textureAtlasRegion.ts:80`)
- `setTextureAtlasRegion(out, source)` — overwrites all 14 fields from a `Partial<TextureAtlasRegionLike>` with the same defaults as the constructor; alias-safe. (`textureAtlasRegion.ts:444`)
- `removeTextureAtlasRegion(target, id)` — splices the region with the given id, returns boolean. Ids stay valid across removals via the high-water mark. (`textureAtlasRegion.ts:433`)
- `clearTextureAtlasRegions(target)` — empties the regions array. (`textureAtlasRegion.ts:116`)

### Queries

- `getTextureAtlasRegionById(atlas, id)` — linear scan, null sentinel. (`textureAtlasRegion.ts:153`)
- `getTextureAtlasRegionByName(atlas, name)` — linear scan, case-sensitive, null sentinel. (`textureAtlasRegion.ts:162`)
- `getTextureAtlasRegionByOrdinal(atlas, prefix, ordinal)` — finds the region matching the prefix whose trailing name digits parse to the given ordinal; zero-padding insensitive. (`textureAtlasRegion.ts:177`)
- `getTextureAtlasRegionOrdinal(region)` — parses trailing decimal digits from the name, returns -1 for null/no-digits. (`textureAtlasRegion.ts:227`)
- `getTextureAtlasRegionSequence(atlas, prefix, out)` — collects prefix-matched regions into `out`, sorted by parsed ordinal via stable in-place insertion sort; unnumbered regions sort after the numbered run. (`textureAtlasRegion.ts:258`)
- `getTextureAtlasRegionCount(atlas)` — region count. (`textureAtlasRegion.ts:190`)
- `hasTextureAtlasRegion(atlas, name)` — boolean predicate over `getTextureAtlasRegionByName`. (`textureAtlasRegion.ts:426`)
- `buildTextureAtlasRegionIndex(atlas)` — returns an explicitly built `Map<string, TextureAtlasRegion>` for O(1) name lookup; first-match on duplicates; documented as a snapshot. (`textureAtlasRegion.ts:107`)

### UV and frame math

- `getTextureAtlasRegionUv(region, imageWidth, imageHeight, out)` — normalized UV rect into `out`, alias-safe, zero-rect sentinel on zero dimensions. (`textureAtlasRegion.ts:334`)
- `getTextureAtlasRegionUvQuad(region, imageWidth, imageHeight, out)` — 8-element `number[]` of four UV corners in TL/TR/BR/BL drawn-quad order, with packed rotation already applied. (`textureAtlasRegion.ts:385`)
- `getTextureAtlasRegionFrame(region, out)` — trim offset and original extent into `out` (`RectangleLike`), falling back to packed extent for untrimmed regions. (`textureAtlasRegion.ts:204`)

### Region texture minting

- `getTextureAtlasRegionTexture(atlas, regionId)` — returns a cached `Texture2D` per region with the window re-derived on every call (contract: identity cached, contents recomputed). Refuses a rotated page (would require shear). Shared reference is mutated in place. (`textureAtlasRegion.ts:304`)
- `explainTextureAtlasRegionTexture(atlas, regionId)` — returns `TextureAtlasRegionTextureExplanation` with status `ready` / `missing-region` / `missing-texture` / `rotated-page`. (`textureAtlasRegion.ts:142`)

### Diagnostics

- `enableTextureAtlasGuards()` / `disableTextureAtlasGuards()` / `areTextureAtlasGuardsEnabled()` — installs a guard that warns once (via `@flighthq/log` `logOnce`) when a rotated page prevents region texture minting. (`enableTextureAtlasGuards.ts`)
- `setTextureAtlasRegionTextureGuard` — contract-only export for the guard callback wiring. (`textureAtlasRegion.ts:479`)

### Testing

122 test cases across 5 test files. Coverage is thorough: alias-safety, idempotency, sentinel paths, id-collision regressions, ordinal parsing edge cases (zero-padded, no digits, all digits, interior digits), sequence ordering (including the unpadded-numeric-sort regression), region-texture recompute contract, shared-reference mutation behavior, and the guards layer. Tests use constructors (`createTextureAtlasRegion`, `createTextureAtlas`, `createRectangle`, `createVector2`) for entity types and structural literals only for `*Like` inputs.

## Gaps vs an authoritative texture-atlas library

### Multi-page / multipack atlases

`TextureAtlas.texture` is a single `Texture2D | null` (`TextureAtlas.ts:6`). There is no `pages` array and no per-region page index on `TextureAtlasRegion`. TexturePacker multipack, libGDX multi-page `.atlas` files, and any 4K-budget production pipeline emit multiple pages with each region bound to a page index. The formats package (`textureatlas-formats`) must flatten multi-page data into a single atlas. This is the single largest structural gap and the primary barrier to authoritative status. The charter's Open direction 2 acknowledges it.

### Nine-slice / nine-patch metadata

libGDX regions carry `split` and `pad` values; TexturePacker exports borders for scale-9. Nothing on `TextureAtlasRegion` can represent nine-slice data, so UI atlas workflows have no home. The charter is silent on this.

### Padding / extrude metadata

Regions carry trim, pivot, and rotation but no padding or extrude fields (`TextureAtlasRegion.ts:4-16`). Bleed-margin metadata from packers (extrude, inner/outer padding) has nowhere to land. The status notes this at its last point. The charter's Open direction 1 partially covers this.

### Stale function name

`createTextureAtlasFromImageResource` (`textureAtlasFrom.ts:33`) takes an `Image` parameter, but the name says `ImageResource` — a type that no longer exists after being split into `Image` + `ExternalTexture`. The four `loadTextureAtlasFrom*` functions all route through it, so the name is load-bearing across the file. The upstream `@flighthq/image` factory functions (`createImageResourceFromCanvas`, etc.) carry the same stale prefix, so this is part of a broader cross-package naming sweep rather than a textureatlas-only fix. The status documents this.

### `GridSliceOptions.imageFile` unused

`GridSliceOptions` (in `@flighthq/types`) has a required `imageFile: string` field, but `createTextureAtlasFromGrid` (`textureAtlasGrid.ts:9`) never reads it. Tests pass empty strings for it. The field likely exists for the benefit of `textureatlas-formats` parsers that emit grid options, but requiring it from callers of the grid slicer is unnecessary coupling.

## Charter contradictions

None found. The code aligns with all stated North-star principles, Boundaries, and Decisions:

- **Atlas description, not atlas production** — the package has no packing logic; `binpack` is a separate cell.
- **Entity lifecycle consistency** — `create*`, `load*From*`, `dispose*`, query helpers follow the pattern.
- **Uint8Array for byte inputs** — `loadTextureAtlasFromBytes` accepts `Uint8Array`.
- **Region ids past high-water mark** (Decision 2026-07-30) — implemented with `WeakMap`-backed mark, tested for collision and ABA hazard.
- **`setTextureAtlasRegion` takes whole source entity** (Decision 2026-07-30) — implemented as `Partial<TextureAtlasRegionLike>`, alias-safe, all 14 fields overwritten.
- **Trim placement and rotated UV corners** (Decision 2026-07-30) — `getTextureAtlasRegionFrame` and `getTextureAtlasRegionUvQuad` exist and are tested.
- **Name index built explicitly** (Decision 2026-07-30) — `buildTextureAtlasRegionIndex` returns a `Map`, documented as a snapshot.
- **Sequence ordered by parsed ordinal** (Decision 2026-08-01) — stable insertion sort, tested for unpadded numeric ordering.
- **Region-texture recompute contract** (Decision 2026-08-01) — re-derivation on every call pinned by test, shared-mutation cost documented and tested.

## Contract and docs fit

### Package adherence to SDK contract

- **Types in `@flighthq/types`**: `TextureAtlas`, `TextureAtlasRegion`, `TextureAtlasRegionLike`, `TextureAtlasRegionTextureExplanation`, `TextureAtlasRegionTextureGuard`, `TextureAtlasRegionTextureStatus`, `GridSliceOptions` all live in `@flighthq/types`. The package exports functions only.
- **Two blessed lanes**: `.` (index.ts) is the public lane with 36 named exports; `./contract` (contract.ts) re-exports everything including `setTextureAtlasRegionTextureGuard`. Correct.
- **`sideEffects: false`**: declared in package.json.
- **Full unabbreviated names**: every export carries the full `TextureAtlas` or `TextureAtlasRegion` type word. No abbreviations.
- **`Readonly<T>` usage**: consistently applied to input parameters throughout.
- **Out-parameter convention**: `getTextureAtlasRegionUv`, `getTextureAtlasRegionUvQuad`, `getTextureAtlasRegionFrame`, `getTextureAtlasRegionSequence`, `setTextureAtlasRegion` all use `out` parameters, alias-safe. The `get*` naming on sequence/frame is correct since they write into `out`.
- **Sentinel returns**: `null` for missing regions, `0` for no byte size, `-1` for no ordinal, `false` for failed removal. No throws on expected failures.
- **Diagnostics inversion**: `explainTextureAtlasRegionTexture` returns plain data; `enableTextureAtlasGuards` installs the warning layer separately. Correct application of the inversion rule.
- **No side-effect imports**: guard installation is explicit via `enableTextureAtlasGuards()`.

### Candidate revisions to docs or contract

- **Package Map entry** (`map.md:76`): reads "texture atlases -- regions, UVs, and constructors over image resources." This is thin — it omits the ordinal/sequence queries, the frame/UV-quad math, the region-texture minting, the diagnostics layer, and the grid slicer. The neighboring `binpack` entry has a comprehensive description. The charter's Open direction 3 already notes this.

## Candidate open directions

These are questions the charter does not answer that this review had to assume or leave unresolved:

1. **Nine-slice / nine-patch metadata.** The charter mentions padding in Open direction 1 but does not mention nine-slice specifically. Should `TextureAtlasRegion` carry optional `splits`/`pads` fields or a separate `TextureAtlasRegionNineSlice` type? This is a question about whether atlas regions serve UI layout, not just sprite rendering.

2. **The `ImageResource` naming sweep.** `createTextureAtlasFromImageResource` names a type that no longer exists, but the upstream `@flighthq/image` functions carry the same stale prefix. Is this a textureatlas fix or part of a broader cross-package rename? The charter is silent.

3. **`GridSliceOptions.imageFile` ownership.** The field is required on the type but unused by this package's only consumer of it. Should it be optional, or should the type be split so textureatlas uses a narrower subset? This touches the boundary between textureatlas and textureatlas-formats.
