---
package: '@flighthq/texture'
status: solid
score: 76
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - types
---

# Review: @flighthq/texture

**Evidence and population.** Full re-review of `packages/texture/src/` (7 source files, 7 colocated
test files, 2181 total lines), the type surface in `packages/types/src/` (Texture, Sampler,
TextureSource, TextureUvTransform, CubeTexture, RenderTexture, RenderTarget, VoxelGrid,
TextureCubeFace, TextureSourceKind, TextureDimension, CreateTextureOptions, CreateCubeTextureOptions,
CreateRenderTextureOptions, ExternalTexture), `package.json`, `index.ts`, and `contract.ts`. Exports
counted from the public barrel; claims verified against source line numbers.

## Verdict

**solid -- 76/100.** The prior review's compile blocker (missing `CubeFace*` constants in
`@flighthq/types`) is fully resolved: `TextureCubeFace.ts` defines all six and the contract barrel
exports them. The stale `@flighthq/resources` dependency is gone. The package now ships a clean,
well-shaped descriptor layer: 54 exported symbols from the public lane across six functional domains
(Texture, CubeTexture, RenderTexture, Sampler, VideoTexture, VoxelGrid) plus color-space derivation.
Construction, cloning, copying, equality, UV-matrix composition, and sampler presets are all present
and alias-safe. 107 test cases across 7 test files provide solid coverage of the core 2D and cube
paths.

The score rises from 58 to 76 because the hard blocker is gone and the existing surface is
contract-clean. Three things hold it below 85: the `'3d'` and `'2d-array'` texture dimensions
have zero dedicated test coverage despite being modeled in the `createTexture` switch; the
`invalidateTexture` verb is absent (version is bumped inline by three separate mutators, against
the invalidation doctrine); and the video-texture surface carries four pass-through aliases that add
names without behavior.

## Present capabilities

The public lane (`index.ts`) exports 54 symbols (all functions). The contract lane (`contract.ts`)
re-exports everything via `export *` from 6 modules plus the 3 color-space functions. Dependencies:
`@flighthq/entity`, `@flighthq/geometry`, `@flighthq/types`. `sideEffects: false` declared. No
renderer registration, no module-level mutable state. Two blessed export lanes with no other subpaths.

### Texture descriptor (`texture.ts`, 402 lines)

- `createTexture` -- four-way constructor for all texture dimensions: `'2d'` (default), `'2d-array'`,
  `'3d'`, and `'cube'`. Default state: null source, `'srgb'` color space, identity UV transform, and
  default sampler. Clones supplied sampler and UV vectors rather than aliasing. Attaches texture to an
  optional `ImageResourceReference` for loader tracking.
- `createTexture2D` -- dedicated two-dimensional leaf; `createTexture` composes it for its own 2D case,
  ensuring a single definition of what a 2D texture is.
- `cloneTexture` -- deep-clones sampler and UV vectors while sharing the source reference. Returns the
  correct dimension variant via a four-way switch.
- `copyTexture` -- in-place field copy preserving the out entity's sampler and UV-vector identities.
  Reads all scalar inputs into locals before any write (alias-safe when `out === source`). Throws on
  dimension mismatch (programmer error, not expected failure).
- `equalsTexture` -- full structural comparison including color space, flip flags, UV transform, sampler
  state, source references, and version. Returns false for null/undefined operands.
- `getTextureWidth`, `getTextureHeight` -- dimension queries from the active source; `-1` when unbound.
- `getTextureUvMatrix` -- composes the KHR_texture_transform fields (scale, rotate, translate, flip)
  into a column-major 3x3 matrix suitable for GL/WGSL `mat3` uniform upload. Out-param form;
  reads all texture fields into locals before writing `out.m`.
- `getTextureInverseUvMatrix` -- composed as forward matrix followed by `inverseMatrix3`.
- `transformTextureUv` -- inline single-point UV transform without matrix allocation; verified to agree
  with `getTextureUvMatrix` in tests.
- `getTextureSource`, `getTextureSourceKind` -- first active source and its open-registry kind key.
  Array and cube textures yield their first non-null slot.
- `hasTextureSource`, `isTextureReady`, `hasTextureUvTransform` -- boolean readiness and identity gates.
- `setTextureSource` -- binds or clears a 2D texture's source with u32 version bump. No-op when
  reference is unchanged. Throws on non-2D textures.
- `setTextureFlip`, `setTextureUvOffset`, `setTextureUvRotation`, `setTextureUvScale` -- in-place UV
  mutators.
- `setTextureUvFromPixelRect` -- normalizes a pixel rectangle against source dimensions.
- `resetTextureUvTransform` -- restores identity UV transform without touching source, color space,
  sampler, or version.

### Cube texture (`cubeTexture.ts`, 58 lines)

- `createCubeTexture` -- delegates to `createTexture({ dimension: 'cube' })` with default six-null
  face array. Copies supplied sources array and sampler rather than aliasing.
- `cloneCubeTexture`, `copyCubeTexture`, `equalsCubeTexture` -- thin typed wrappers over the
  universal Texture equivalents.
- `getCubeTextureFaceSize` -- returns width of the first non-null face, or `-1`.
- `isCubeTextureComplete` -- true when all six face slots are non-null.
- `setCubeTextureFace` -- binds or clears a single face slot by index with version bump. No-op when
  reference is unchanged.

### Render texture (`renderTexture.ts`, 44 lines)

- `createRenderTexture` -- constructs a `Texture2D` with a `RenderTarget` source inline. Default
  color space is `'linear'` (not `'srgb'`). Supports all `RenderTargetDescriptor` axes
  (format, colorAttachments, colorFormats, sampleCount, depth, clearColors, clearDepth) plus
  sampling/UV overrides. Copies sampler and UV values without aliasing.

### Sampler (`sampler.ts`, 83 lines)

- `createSampler` -- default state: clamp-to-edge, linear mag, linear-mipmap-linear min, mipmaps on,
  anisotropy 1. Accepts partial overrides.
- `cloneSampler`, `copySampler`, `equalsSampler` -- full create/clone/copy/equals quartet.
- Named presets: `createAnisotropicSampler(level)`, `createClampLinearSampler()`,
  `createPixelArtSampler()`, `createTilingSampler()` -- thin compositions over `createSampler`.

### Video texture (`videoTexture.ts`, 126 lines)

- `createVideoTexture` -- wraps a `VideoResource`'s borrowed host element in an `Image` source and
  returns a universal `Texture2D`. Initial version is `0xffffffff` (the u32 predecessor of 0).
- `advanceVideoTexture` -- bumps both the `Image` source and `Texture` version, updates video
  dimensions from the element. Returns new version (wraps to 0 on first call).
- `destroyVideoTexture` -- nulls the source and resets the version. Idempotent.
- `isVideoTextureFrameReady` -- true when the element has `readyState >= HAVE_CURRENT_DATA` and
  non-zero dimensions.
- `getVideoTextureWidth`, `getVideoTextureHeight` -- from the element's `videoWidth`/`videoHeight`.
- `setVideoTextureSource` -- replaces the host handle and resets the version.
- `resetVideoTextureFrame` -- resets the version sentinel so the next advance re-uploads everywhere.
- `cloneVideoTexture`, `copyVideoTexture`, `getVideoTextureUvMatrix`,
  `getVideoTextureInverseUvMatrix` -- pass-throughs to the universal Texture equivalents,
  labelled "compatibility entry" in source comments.

### Voxel grid (`voxelGrid.ts`, 6 lines)

- `invalidateVoxelGrid` -- advances the u32 version counter so every Texture sampling this shared
  source re-uploads. The only VoxelGrid export in this package.

### Color-space derivation (`textureColorSpace.ts`, 46 lines)

- `shouldDecodeTextureOnSample` -- true only for sRGB content in a linear working space, the one
  direction GPU hardware decodes for free.
- `shouldPremultiplyTextureOnUpload` -- exact inverse: upload-time premultiply is valid only when
  no decode runs afterward.
- `getTextureSampleColorSpace` -- returns `'srgb'` or `'linear'` as the sample format the backend
  should select.

## Gaps

- **No tests for `'3d'` dimension.** `createTexture({ dimension: '3d' })` and its branches in
  `cloneTexture`, `copyTexture`, and `equalsTextureContent` are entirely untested. The switch arm
  exists in source (`texture.ts:54`, `:93`, `:129`) but no test file exercises it.
- **Minimal tests for `'2d-array'` dimension.** Only `getTextureSource` tests touch `'2d-array'`
  (`texture.test.ts:344`, `:352`). The `cloneTexture`, `copyTexture`, and `equalsTexture` code paths
  for this dimension are untested.
- **No `invalidateTexture` verb.** Version is bumped inline by `setTextureSource` (`texture.ts:304`),
  `setCubeTextureFace` (`cubeTexture.ts:57`), and `advanceVideoTexture` (`videoTexture.ts:15`). The
  invalidation doctrine specifies `invalidate<Type>` as the canonical verb; callers who write
  `texture.source` directly and need to signal the change have no exported invalidation function.
- **No `createVoxelGrid`.** `invalidateVoxelGrid` is the package's only VoxelGrid export. No
  constructor for a 3D texture's source exists anywhere in the repo. A `'3d'` texture's source can
  only be hand-assembled as a literal, missing the entity identity `createEntity` would provide.
- **Four video pass-through aliases.** `cloneVideoTexture`, `copyVideoTexture`,
  `getVideoTextureInverseUvMatrix`, and `getVideoTextureUvMatrix` delegate entirely to the
  universal Texture equivalents with no added behavior. They are exported from both barrels,
  doubling names for one behavior.
- **`equalsTexture` compares `version`.** The comparison at `texture.ts:180` means two textures
  describing identical visual state but carrying different revision counters compare unequal. The
  `version` field is a dirty-bit for GPU cache invalidation, not semantic state. Whether this is
  intentional or a defect depends on whether `equals` is meant as "same GPU upload" or "same
  visual appearance."
- **No guard or `explain*` module.** The `-1` sentinel from `getTextureWidth`/`getTextureHeight`
  (`texture.ts:188`, `:248`) and the `null` from `getTextureSourceKind` (`texture.ts:209`) have no
  pull query for diagnostics.
- **No `Texture.format` or `mipPolicy`.** Upload format and mip generation policy are each backend's
  decision. The descriptor carries no hint for the GPU layer.
- **`videoTexture.ts` references `HTMLVideoElement` directly** (`videoTexture.ts:110`, `:119`)
  including `readyState` and `videoWidth`/`videoHeight`, coupling the implementation to browser DOM
  types. This is a portability concern for the C/C++ trajectory.
- **`renderTexture.ts` constructs a `RenderTarget` via inline `createEntity`** rather than a
  dedicated `createRenderTarget` function. The render target is an entity (carries runtime) but has
  no constructor outside this inline usage.

## Charter contradictions

- **Charter open direction 3 (Texture2DArray and 3D volume textures) is partially stale.** The
  charter states "Neither is modeled." In fact, both `'2d-array'` and `'3d'` are modeled as
  `Texture` union variants (`packages/types/src/Texture.ts:40-48`) and handled by `createTexture`,
  `cloneTexture`, `copyTexture`, and `equalsTexture`. The charter should be updated to reflect that
  these dimensions exist in the type and constructor but lack dedicated test coverage and higher-level
  surface (`createTexture2DArray`, `createTexture3D`, `createVoxelGrid`).
- **Charter open direction 5 (unused `@flighthq/resources` dependency) is resolved.** The dependency
  no longer appears in `package.json`. The charter should remove this direction.
- **Charter boundary scope lists `CubeFace*` constants as in scope.** They are correctly defined in
  `@flighthq/types/src/TextureCubeFace.ts` and not in this package, consistent with the types-home
  rule. The charter's wording is accurate (they are "in scope" as consumed identifiers, defined in
  types per convention).

## Contract & docs fit

- **Export lanes** -- public barrel is a curated explicit list of 54 symbols; contract re-exports
  everything via `export *` from 6 modules plus the 3 color-space functions from
  `textureColorSpace.ts`. No other subpaths. Both lanes are correct.
- **Naming** -- all exported functions carry the full unabbreviated type name (`getTextureUvMatrix`,
  `getCubeTextureFaceSize`, `equalsCubeTexture`, `advanceVideoTexture`). `get*`/`set*`/`has*`/
  `is*`/`create*`/`clone*`/`copy*`/`equals*`/`destroy*`/`reset*`/`invalidate*` verbs match the SDK
  conventions. `transformTextureUv` uses the verb-first pattern.
- **Allocation** -- `create*`/`clone*` allocate. `copy*`/`set*` write in place. `getTextureUvMatrix`
  and `getTextureInverseUvMatrix` use out-param form. `transformTextureUv` takes scalar inputs and
  writes to a Vector2 out-param.
- **Out-parameter safety** -- `copyTexture` (`texture.ts:69-102`) reads all scalar fields into locals
  (`colorSpace`, `flipX`, `flipY`, `uvRotation`, `version`) before writing any output field, and
  delegates `copySampler`/`copyVector2` for compound fields. Tests explicitly cover the aliased
  case (`texture.test.ts:113-128`, `cubeTexture.test.ts:59-69`, `sampler.test.ts:44-51`).
  `getTextureUvMatrix` reads all texture fields into locals before writing `out.m`.
- **Sentinels** -- `-1` for unbound dimensions (`getTextureWidth`, `getTextureHeight`,
  `getCubeTextureFaceSize`, `getVideoTextureWidth`, `getVideoTextureHeight`), `null` for
  `getTextureSource`/`getTextureSourceKind`, `false` for null/undefined operands in all `equals*`
  functions. Throws only for programmer errors (`copyTexture` dimension mismatch,
  `setTextureSource` on non-2D).
- **Readonly<>** -- applied consistently on input parameters across all source files (48 total
  `Readonly<` usages across the 4 main source files). Mutable outputs are named `out` or `texture`.
- **Version/invalidation** -- version is bumped with u32 wrapping (`(v + 1) >>> 0`) in `setTextureSource`,
  `setCubeTextureFace`, and `advanceVideoTexture`. The `invalidateVoxelGrid` function uses the
  `invalidate<Type>` naming convention. The absence of `invalidateTexture` is the gap noted above.
- **Testing** -- one test file per source file, colocated in `src/`. 107 test cases across 7 files.
  `describe` blocks are alphabetized and mirror exported function names. Alias-safe copy tested
  explicitly. `expectTypeOf` used for constructor return types. Module-scope fake objects at the top,
  no structural divider comments.
- **sideEffects** -- `false` declared and no module-level side effects observed. No top-level
  `registerRenderer` calls. `HAVE_CURRENT_DATA` and `INITIAL_VIDEO_VERSION` are file-bottom
  constants per the source-style convention.
- **Types in `@flighthq/types`** -- all types are imported from `@flighthq/types/contract`. The
  implementation package exports functions only.

## Candidate open directions

1. **Dedicated constructors for non-2D dimensions.** `createTexture2DArray`,
   `createTexture3D`/`createVolumeTexture`, and `createVoxelGrid` would bring the `'2d-array'` and
   `'3d'` paths to the same maturity as the 2D and cube paths, each with their own test coverage.
2. **`invalidateTexture` verb.** A single exported verb for direct-write version bumping would unify
   the three inline `(version + 1) >>> 0` sites and align with the invalidation doctrine.
3. **Resolve `equalsTexture` version semantics.** Decide whether `equals` means "same GPU upload
   identity" (include version) or "same visual state" (exclude it). The current behavior is
   internally consistent but undocumented as a design choice.
4. **Video pass-through consolidation.** Evaluate whether the four video aliases earn their export
   slots or whether callers should use the universal Texture functions directly.
5. **Guard module for sentinels.** An `enableTextureGuards` or `explainTextureWidth` pull query would
   make the `-1` / `null` sentinels diagnosable per the diagnostics convention.
6. **Video texture portability.** `HTMLVideoElement` access in `videoTexture.ts` ties the
   implementation to browser DOM. A host-abstracted video handle (via the `VideoResource` already
   in scope) would bring this closer to the C/C++ portability goal.
7. **Render target constructor.** A `createRenderTarget` function would give the RenderTarget source
   its own construction path rather than being assembled inline in `createRenderTexture`.
