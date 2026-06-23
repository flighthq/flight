# Maturation Roadmap: @flighthq/texture

**Current verdict:** solid — 62/100. A correct, well-styled foundation for the texture-binding seam (Texture / Sampler / CubeTexture entities with create/clone/copy), but roughly two-thirds of the canonical texture-domain depth: missing equality/dirty tracking, uv-transform math, cube-face helpers, format/mip policy, and the texture-array / 3D-volume kinds.

The package occupies a deliberately narrow charter — the **portable plain-data description of a texture binding**, sitting between `@flighthq/resources` (pixels) and `render-gl` / `render-wgpu` / `scene-*` (GPU upload + sampling). The roadmap below grows depth _within that charter_; it does not pull in pixel ops (`@flighthq/surface`), GPU lifecycle (`render-*`), or decoding (`@flighthq/resources`/`loader`).

## Bronze

The 20% that closes the most glaring symmetry and "data-with-no-behavior" gaps. All additions are in-scope leaf work with no cross-package design decisions; ship these first.

- **`equalsTexture(a, b)`** and **`equalsCubeTexture(a, b)`** — null-safe value equality mirroring `equalsSampler` (delegating to `equalsSampler` for the shared sampler, comparing `colorSpace`, `image` identity, and uv-transform fields). Closes the equality asymmetry; this is the de-dup/cache-detection hook backends already need.
- **`copyCubeTexture(out, source)`** — in-place copy completing the create/clone/copy quartet for the third entity (alias-safe, copies the `faces` array contents and `copySampler` into `out.sampler`).
- **`isCubeTextureComplete(cube)`** — readiness gate parallel to `isTextureReady`; true when all six faces are non-null. Materials/IBL sample behind this.
- **`setCubeTextureFace(cube, faceIndex, image)`** + named face constants **`CubeFacePositiveX` / `CubeFaceNegativeX` / `CubeFacePositiveY` / `CubeFaceNegativeY` / `CubeFacePositiveZ` / `CubeFaceNegativeZ`** (numeric `0..5` consts in `@flighthq/types`) — removes magic-number indexing into the raw `faces` array.
- **uv-transform setters: `setTextureUvOffset(texture, x, y)`, `setTextureUvScale(texture, x, y)`, `setTextureUvRotation(texture, radians)`** — in-place mutators so callers stop poking loose Vector2 fields directly. Cheap; restores "behavior" to the stored uv model.
- **`getTextureUvMatrix(out, texture)`** — composes `uvOffset` / `uvRotation` / `uvScale` into a `Matrix3` (the KHR_texture_transform 3×3 the shader consumes). Uses the existing `@flighthq/geometry` `matrix3`; out-param, alias-safe. This is the shared math the package should own so every material/backend stops reimplementing it.

## Silver

Brings the package to "competitive, professional" depth — the format/usage policy, dirty tracking, and presets a good texture library is expected to carry, plus the asymmetries a reviewer would flag.

- **Descriptor format/usage policy on `Texture` (types-first):** add nullable hint fields to the `Texture` interface in `@flighthq/types` — `format: PixelFormat | null` (desired upload format hint, defaulting to `null` = "infer from image"), and a mip policy richer than the boolean. Introduce **`TextureMipPolicy = 'none' | 'auto' | 'manual'`** and a `mipPolicy` field (the `Sampler.mipmaps` boolean stays sampling-side; `mipPolicy` is the generation-strategy descriptor). Update `createTexture`/`cloneTexture`/`copyTexture`/`equalsTexture` to carry them.
- **Per-binding dirty/version tracking:** add a **`version: number`** field to `Texture` and `CubeTexture` (mirroring the established `ImageResource.version` convention) plus **`invalidateTexture(texture)`** / **`invalidateCubeTexture(cube)`** bump helpers, and have `setTextureImage` / `setCubeTextureFace` / the uv setters bump it. Gives the GPU-upload caches in `render-gl`/`render-wgpu` a cheap "binding changed, re-upload" signal instead of every consumer diffing by hand. (The _upload_ still lives in the renderer; the package only owns the change signal.)
- **Sampler presets** — named canonical samplers as `create*` helpers: **`createPixelArtSampler()`** (nearest-clamp, no mips), **`createTilingSampler()`** (repeat, trilinear), **`createClampLinearSampler()`** (the current default, named), **`createAnisotropicSampler(level)`**. Mature libraries ship these; they tree-shake to nothing if unused.
- **`getTextureWidth(texture)` / `getTextureHeight(texture)`** — convenience accessors reading the bound `ImageResource` dimensions, returning `-1` (sentinel) when `image` is null. Parallel `getCubeTextureFaceSize`.
- **2D-array texture kind (`Texture2DArray`)** — first-class entity in `@flighthq/types` (`kind: Texture2DArrayKind`) for sprite layers / shadow cascades / texture stacks: `layers: readonly (ImageResource | null)[]`, shared `sampler` + `colorSpace`, with the full **`createTexture2DArray` / `cloneTexture2DArray` / `copyTexture2DArray` / `equalsTexture2DArray` / `setTexture2DArrayLayer` / `isTexture2DArrayComplete`** quartet+. This is a contained leaf the same shape as CubeTexture; surface the renderer-upload coordination to the user but the descriptor itself is in-scope.
- **`*Kind` string identifiers for every entity** — `TextureKind`, `SamplerKind`, `CubeTextureKind`, `Texture2DArrayKind`, `Texture3DKind` (see Gold) defined in `@flighthq/types`, so a serialized scene round-trips texture bindings and the renderer registry can key on them.

## Gold

The authoritative frontier — the remaining standard GPU-texture kinds, exhaustive helpers, full Rust-port parity, and the test/doc bar a domain expert checks.

- **3D / volume texture kind (`Texture3D`)** — `Texture3DKind`, depth-stacked data for LUTs / volumetrics, with the same create/clone/copy/equals/set-slice/complete family. Completes the canonical 2D / 2D-array / 3D / cube quartet of GPU texture kinds.
- **Render-target / writable-texture intent** — a **`TextureUsage`** descriptor (`'sampled' | 'render-target' | 'storage'` as an open string set, not a closed union) on the texture entities, so a graph that renders _into_ a texture (the "any Mesh + Material can consume another graph's output" path the `Texture` doc already describes) is expressible as data. The renderer reads usage to allocate the right GPU resource; the package only declares intent.
- **Swizzle / channel-remap descriptor** — `TextureSwizzle` (per-channel `r/g/b/a` source mapping) for packed data maps (e.g. reading roughness from a single channel). Plain data; backend applies at sample time.
- **uv-transform completeness** — `getTextureUvMatrix` inverse (`getTextureInverseUvMatrix`), `transformTextureUv(out, texture, u, v)` point-transform helper, and `resetTextureUvTransform(texture)`. Full operating set over the stored transform model.
- **Compressed-payload awareness** — once `ImageResource` grows the reserved `compressed` slot (KTX2/Basis, currently deferred at the types level), add a **`-formats` neighbor package `@flighthq/texture-formats`** holding the KTX2/Basis container parsers (`parseKtx2Texture`, `parseBasisTexture`) that produce `Texture` descriptors. Keeps the core package importer-free and tree-shakable; cross-package dependency on the `ImageResource.compressed` decision (surface to user before building).
- **Exhaustive tests** — `equals*` true/false matrices per field; clone/copy ownership (face-array and uv-vector independence, alias-safety with `out === source`); uv-matrix math against KHR_texture_transform reference vectors; preset-sampler field assertions; version-bump assertions on every mutator. One `*.test.ts` per source file, `describe` blocks alphabetized and mirroring exports (per `exports:check` / `order:check`).
- **1:1 Rust-port parity** — extend `crates/flighthq-texture` (`texture.rs`, `sampler.rs`, `cube_texture.rs` exist) to mirror every TS addition: `equals_texture`, `copy_cube_texture`, `is_cube_texture_complete`, `set_cube_texture_face` + `CUBE_FACE_*` consts, the uv setters + `get_texture_uv_matrix` (over the `flighthq-geometry` `Matrix3`), presets, `Texture2DArray` / `Texture3D` (new `texture_2d_array.rs` / `texture_3d.rs`), `version` + `invalidate_*`, and `KindId` mirrors of the `*Kind` strings. Add the conformance-map entry and assertion-ported unit tests; this is the largest single line item.
- **Docs** — a short package-doc pass making the seam boundary explicit (what is here vs `surface` / `render-*` / `resources`), the color-space + uv-transform contract, and the kind taxonomy, so the header layer is navigable from `@flighthq/types` alone.

## Sequencing & effort

Recommended order, with dependencies and the items that must be surfaced rather than built autonomously:

1. **Bronze, all of it (small, no design decisions).** Pure in-package leaf work over existing `@flighthq/types` and `@flighthq/geometry` (`matrix3`). The face constants need a tiny `@flighthq/types` addition. Run `npm run exports:check` (every new export needs a colocated test) and `npm run order:fix`. This is a half-day of work and removes every asymmetry the depth review flagged as "fix."

2. **Silver presets + accessors + `equalsTexture`/uv setters** (already partly Bronze) — no cross-package coupling; do alongside Bronze.

3. **Silver format/mip-policy + `version`/`invalidate_*` (types-first).** Define the fields in `@flighthq/types` first (header layer), then implement. **Cross-package design item — surface to user:** the dirty/version field exists to serve the GPU-upload caches in `render-gl` / `render-wgpu` / `scene-gl` / `scene-wgpu`; confirm those packages will _consume_ `texture.version` (and how they key their caches) before committing the field shape, so the seam matches the renderer's needs. `TextureMipPolicy` likewise must agree with what the upload layer can actually execute.

4. **Silver `Texture2DArray` kind** — contained, but its value is only realized once a renderer uploads array layers. **Surface to user:** adding the kind is in-scope (it's a descriptor), but the renderer-side array-texture upload (`render-gl`/`render-wgpu`) is a separate package change; decide whether to land the descriptor ahead of the consumer or together.

5. **Gold `Texture3D` + `TextureUsage` + swizzle** — these cross most deeply into the renderer/material layer. `TextureUsage` in particular touches the "render into a texture" pipeline and should be designed _with_ the render-target work in `render-wgpu`/`scene-*`, not ahead of it. Surface as a joint design decision.

6. **Gold `@flighthq/texture-formats`** — blocked on the `ImageResource.compressed` slot, which is explicitly deferred at the types level today. Do not start until that decision lands; raise it as a prerequisite.

7. **Gold Rust parity** — track each TS addition; port in the same PR family where practical so the conformance map never drifts. Largest effort; the new-kind crates (`texture_2d_array.rs`, `texture_3d.rs`) and the uv-matrix math are the bulk.

**Dependency summary:** Bronze/Silver-presets depend only on `@flighthq/types` + `@flighthq/geometry` (both present, `matrix3` ready). The `version`/policy/array/usage items each have a _consumer_ in `render-gl` / `render-wgpu` / `scene-gl` / `scene-wgpu` whose needs should shape the descriptor — those are the cross-package design conversations to have up front. `texture-formats` is gated on an `ImageResource` types decision. The Rust crate mirror trails the TS spec by the conformance rule.
