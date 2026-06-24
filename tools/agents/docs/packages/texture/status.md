---
package: '@flighthq/texture'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# texture — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/texture

**Session date:** 2026-06-24 **Starting score:** 62/100 (solid, but under-built) **Estimated new score:** 80/100 (Silver — symmetry gaps closed, UV behavior fully operable, presets added)

## Implemented APIs

### New types in @flighthq/types

**packages/types/src/CubeFace.ts** (new file)

- `CubeFaceNegativeX = 1`
- `CubeFaceNegativeY = 3`
- `CubeFaceNegativeZ = 5`
- `CubeFacePositiveX = 0`
- `CubeFacePositiveY = 2`
- `CubeFacePositiveZ = 4`

Named face index constants for CubeTexture. Removes magic-number indexing into the raw `faces` array.

**packages/types/src/TextureKind.ts** (new file)

- `CubeTextureKind = 'CubeTexture'`
- `SamplerKind = 'Sampler'`
- `TextureKind = 'Texture'`

String kind identifiers for every texture entity type. Enables renderer registration and serialized scene round-trips.

### cubeTexture.ts additions (Bronze + Silver)

- **`copyCubeTexture(out, source)`** — in-place copy completing the create/clone/copy quartet. Alias-safe (reads all inputs into locals before writing). Copies the Sampler in-place (preserving `out.sampler` identity), copies face references into the existing faces array.
- **`equalsCubeTexture(a, b)`** — null-safe value equality: compares `colorSpace`, `sampler` (via `equalsSampler`), and all six face references. Returns `false` for null/undefined operands.
- **`getCubeTextureFaceSize(cube)`** — returns the width of the first non-null face, or `-1` when all faces are null. Parallel to `getTextureWidth`/`getTextureHeight`.
- **`isCubeTextureComplete(cube)`** — readiness gate, returns `true` when all six faces are non-null.
- **`setCubeTextureFace(cube, faceIndex, image)`** — assigns a single face in place. Documents the use of `CubeFace*` constants from `@flighthq/types`.

### texture.ts additions (Bronze + Silver)

- **`equalsTexture(a, b)`** — null-safe value equality comparing all fields (`colorSpace`, `image` identity, `uvRotation`, `uvOffset.x/y`, `uvScale.x/y`, sampler state). Returns `false` for null/undefined operands. Backend cache-detection hook.
- **`getTextureHeight(texture)`** — returns `texture.image.height` or `-1` when image is null.
- **`getTextureUvMatrix(out, texture)`** — composes `uvOffset`/`uvRotation`/`uvScale` into the KHR_texture_transform 3×3 matrix a shader consumes: `[sx*cos(r), -sy*sin(r), tx; sx*sin(r), sy*cos(r), ty; 0, 0, 1]`. Out-param form; writes into a pre-allocated `Matrix3Like`. No allocations on hot paths.
- **`getTextureWidth(texture)`** — returns `texture.image.width` or `-1` when image is null.
- **`setTextureUvOffset(texture, x, y)`** — mutates `uvOffset` in place.
- **`setTextureUvRotation(texture, radians)`** — mutates `uvRotation` in place.
- **`setTextureUvScale(texture, x, y)`** — mutates `uvScale` in place.

### sampler.ts additions (Silver presets)

- **`createAnisotropicSampler(level)`** — anisotropic sampler at the given level; trilinear/clamp defaults.
- **`createClampLinearSampler()`** — named alias for the default sampler state (clamp/linear/trilinear).
- **`createPixelArtSampler()`** — nearest-neighbor, clamp-to-edge, mipmaps disabled. For pixel-art rendering.
- **`createTilingSampler()`** — repeat wrap on both axes, trilinear filtering, mipmaps on. For seamless surfaces.

### Tests

All 54 tests pass across 3 test files. New test coverage includes:

- `equalsCubeTexture`: true/false per field, null/undefined operands, same-reference fast path
- `copyCubeTexture`: distinct out (sampler identity preserved), alias-safe
- `getCubeTextureFaceSize`: first non-null face, all-null sentinel
- `isCubeTextureComplete`: partial / complete cases
- `setCubeTextureFace`: bind by named constant, unbind with null
- `equalsTexture`: per-field false matrix, null/undefined operands, same-reference fast path
- `getTextureHeight` / `getTextureWidth`: bound / unbound cases
- `getTextureUvMatrix`: identity for default transform, offset encoding, scale encoding, KHR formula with rotation
- `setTextureUvOffset` / `setTextureUvRotation` / `setTextureUvScale`: in-place mutation
- Sampler presets: field assertions for each preset

## Deferred items and why

### Silver — descriptor format/mip-policy

Adding `format: PixelFormat | null` and `TextureMipPolicy = 'none' | 'auto' | 'manual'` to the `Texture` interface requires modifying an existing types file (`Texture.ts`) and updating all four Texture functions (`createTexture`, `cloneTexture`, `copyTexture`, `equalsTexture`). This is straightforward but is a **cross-package design gate**: the GPU-upload caches in `render-gl`/`render-wgpu` must agree on what `mipPolicy` means before the field shape is committed. Deferred — surface to user before proceeding.

### Silver — per-binding version/dirty tracking

Adding `version: number` to `Texture` and `CubeTexture` (and `invalidateTexture`/`invalidateCubeTexture` bump helpers) is mechanically simple but has the same cross-package design dependency: the renderers must be written to _consume_ `texture.version`. The `ImageResource.version` convention is already established; texture version would mirror it. Deferred — confirm render-gl/render-wgpu cache strategy with user first.

### Silver — Texture2DArray kind

A `Texture2DArray` descriptor entity (`createTexture2DArray`, `cloneTexture2DArray`, etc.) is an in-scope descriptor-level addition. Its value is only realized once a renderer uploads array layers; whether to land the descriptor ahead of the consumer is a design decision. Deferred — surface to user.

### Gold — Texture3D / TextureUsage / swizzle

`Texture3D` and the `TextureUsage` descriptor (`'sampled' | 'render-target' | 'storage'`) cross most deeply into the renderer/material layer; `TextureUsage` in particular touches the render-into-a-texture pipeline. Should be designed together with the render-target work in `render-wgpu`/`scene-*`. Deferred — joint design decision.

### Gold — @flighthq/texture-formats

Blocked on the `ImageResource.compressed` slot (KTX2/Basis), which is explicitly deferred at the types level (see `ImageResource.ts` comment). Do not start until that decision lands.

### Gold — Rust parity

The Rust crate `crates/flighthq-texture` (`texture.rs`, `sampler.rs`, `cube_texture.rs`) exists. Each TS addition needs a Rust port:

- `equals_texture`, `get_texture_uv_matrix`, `get_texture_height`, `get_texture_width`, `set_texture_uv_offset/rotation/scale`
- `copy_cube_texture`, `equals_cube_texture`, `get_cube_texture_face_size`, `is_cube_texture_complete`, `set_cube_texture_face` + `CUBE_FACE_*` consts
- Preset samplers: `create_anisotropic_sampler`, `create_pixel_art_sampler`, etc.
- `KindId` mirrors of `CubeTextureKind`, `SamplerKind`, `TextureKind`

This is the largest remaining item and should be tracked in the conformance map.

### Gold — uv-transform completeness

`getTextureInverseUvMatrix`, `transformTextureUv(out, texture, u, v)`, and `resetTextureUvTransform(texture)` were not implemented. The core operating set (compose → matrix) is now present; the helpers are an enhancement. They can be added in a follow-up without any design decisions.

## Concerns and surprises

- **`equalsSampler` null guard order matters.** The original `equalsSampler` checked `a === b` before `!a || !b`, meaning `equalsSampler(undefined, undefined)` returned `true`. This behavior was intentional in `equalsSampler` (both `null` — symmetric agreement) but the new `equalsTexture`/`equalsCubeTexture` should return `false` for null/undefined to match the pattern of `equalsSampler`. The fix is to check `!a || !b` first. Tests now verify this explicitly.

- **`faces` mutability casting.** The `CubeTexture.faces` field is typed `readonly (ImageResource | null)[]` in the interface, requiring `as (ImageResource | null)[]` casts in `copyCubeTexture` and `setCubeTextureFace`. At runtime the array is always mutable (it is `slice()`d or created fresh in `createCubeTexture`/`cloneCubeTexture`). The cast is correct but relies on this invariant.

- **Pre-existing type errors in other packages.** The root `npm run check` reports errors in `scene-wgpu`, `share`, `statusbar`, `surface-rs`, `surface`, `tween`, `types` (Entity/Material/Node tests). None of these are regressions from this session — they were present before.

## Suggestions for future sessions

1. **Confirm with user** before implementing: `version`/`invalidate_*` (renderer cache design), `format`/`mipPolicy` (renderer upload contract), `Texture2DArray` descriptor (ahead-of-consumer vs together).
2. **Gold uv-transform helpers** (`getTextureInverseUvMatrix`, `transformTextureUv`, `resetTextureUvTransform`) can be added in a follow-up session without any design gates — purely in-package math.
3. **Rust parity** for all new additions. The crate exists; port the 15+ new functions and the `CUBE_FACE_*` consts, add a conformance map entry.
4. **`texture-formats` neighbor package** once `ImageResource.compressed` lands — KTX2/Basis container parsers as a tree-shakable `@flighthq/texture-formats` package.
