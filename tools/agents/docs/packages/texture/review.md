---
package: '@flighthq/texture'
status: solid
score: 74
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/texture.md
  - source
  - changes.patch
  - charter.md
---

# texture — Review

Evidence: `incoming/builder-67dc46d64/head/packages/texture/` + `changes.patch` (the texture diff is in `committed.patch`/`working.patch`). Findings reference `67dc46d64:<path>`. Ingested the prior depth review (`reviews/depth/texture.md`, verdict 62/100) and the maturation roadmap (`reviews/maturation/depth/texture.md`); this survey supersedes both as the new baseline.

## Verdict

`solid — 74/100`. A correct, tightly-scoped plain-data texture-binding leaf: the three canonical entities (Texture / Sampler / CubeTexture), each now carrying the full create/clone/copy quartet plus value-equality, the KHR_texture_transform compose-to-`Matrix3` math, accessors, named cube-face constants, and four sampler presets. The builder pass closed every symmetry gap the depth review flagged as "fix" (equality on all three entities, `copyCubeTexture`, `setCubeTextureFace` + face constants, `isCubeTextureComplete`, the uv setters + `getTextureUvMatrix`, width/height/face-size accessors). The 74 (above the depth review's 62, below the worker's self-estimated 80) reflects: the genuine depth added, against the codebase-map AAA bar for a 3D texture library — which still expects the 2D-array / 3D-volume kinds, descriptor-level format/usage/mip policy, and per-binding dirty tracking that are all absent — plus two contract findings (an unused `resources` dependency; three `*Kind` constants with no consumer) and a charter that is a stub, so most of "what good means here" is still assumed, not blessed.

## Present capabilities (verified against source)

**Texture entity** (`texture.ts`). `createTexture` / `cloneTexture` / `copyTexture` over the `Texture` interface (`@flighthq/types` `Texture.ts`): `image` (nullable `ImageResource`), `sampler`, `colorSpace` (`'srgb'` | `'linear'`), and the full KHR_texture_transform triple (`uvOffset`/`uvRotation`/`uvScale`). Defaults are deliberate and correct (`'srgb'` albedo, identity transform, default sampler). Ownership hygiene is right: `createTexture` and `cloneTexture` deep-clone the supplied sampler and uv vectors (verified: `cloneTexture` shares `image`, clones `sampler`/`uvOffset`/`uvScale` — `texture.test.ts:22`); `copyTexture` is alias-safe (reads `colorSpace`/`image`/`uvRotation` into locals before writing, copies sampler/vectors into `out`'s existing entities preserving their identity — covered by both a distinct-`out` test and an `out === source` test, `texture.test.ts:49-78`).

**New texture behavior** (the builder additions): `equalsTexture` (null-safe value equality over colorSpace/image-identity/uv fields, delegating to `equalsSampler`; returns `false` for null/undefined operands, `true` on same-reference fast path); `getTextureUvMatrix(out, texture)` composing the transform into the row-major `Matrix3` a shader consumes (`[sx·cos, -sy·sin, tx; sx·sin, sy·cos, ty; 0,0,1]` — matches the `@flighthq/geometry` row-major `Matrix3` layout, verified against `matrix3.ts`); `getTextureWidth`/`getTextureHeight` (`-1` sentinel when unbound); `setTextureUvOffset`/`setTextureUvRotation`/`setTextureUvScale` in-place mutators; `setTextureImage`; `isTextureReady`. Exports alphabetized; `texture.test.ts` `describe` blocks mirror them 1:1 (12 blocks, 26 `it`s), including KHR-formula assertions for the uv matrix (`texture.test.ts:180`).

**Sampler entity** (`sampler.ts`). `createSampler` / `cloneSampler` / `copySampler` / `equalsSampler` over the canonical GL/Wgpu sampler state (per-axis `wrapU`/`wrapV`, `minFilter`/`magFilter` over the six-mode filter enum, `mipmaps`, `anisotropy`). AAA defaults (clamp-to-edge, linear mag, trilinear min, mipmaps on). `equalsSampler` is the de-dup hook backends key on. Four presets added: `createPixelArtSampler` (nearest/clamp/no-mips), `createTilingSampler` (repeat/trilinear), `createClampLinearSampler` (named default), `createAnisotropicSampler(level)`. These tree-shake to nothing if unused. `copySampler` is field-wise alias-safe (each field read-then-write, independent).

**CubeTexture entity** (`cubeTexture.ts`). `createCubeTexture` / `cloneCubeTexture` / `copyCubeTexture` / `equalsCubeTexture` over six faces in canonical +X,-X,+Y,-Y,+Z,-Z order, shared sampler + color space. `copyCubeTexture` is alias-safe (all six face refs read into locals before writing — `cubeTexture.ts:20`). Plus `setCubeTextureFace(cube, faceIndex, image)`, `getCubeTextureFaceSize` (first non-null face width, `-1` sentinel), `isCubeTextureComplete` (all-six gate, parallel to `isTextureReady`). 7 `describe` blocks / 16 `it`s, all mirroring exports.

**New type files** (`@flighthq/types`): `CubeFace.ts` (`CubeFacePositiveX = 0` … `CubeFaceNegativeZ = 5` — removes magic-number face indexing) and `TextureKind.ts` (`TextureKind`/`SamplerKind`/`CubeTextureKind` string constants). Both are exported from the types barrel (`index.ts:66`, `:439`). `CubeFace*` is consumed in the cube-texture tests; the `*Kind` constants are not yet consumed anywhere (see Gaps).

**Style & packaging.** Plain-data entities, free functions, `Readonly<>` inputs, `out`-params for the matrix math, `-1` sentinels, `is*`/`get*`/`set*`/`equals*`/`create*`/`clone*`/`copy*` verbs all canonical and fully unabbreviated. Types live in `@flighthq/types`. `sideEffects: false`, single `.` export, `crate: flighthq-texture` mirror named in the charter front matter. 54 tests across 3 files (verified by count: 26 + 12 + 16).

## Gaps (vs the AAA 3D-texture-library target; charter North-star/Boundaries are stubs, so codebase-map standard applies)

Missing-by-omission, in-domain, not delegated elsewhere:

- **No 2D-array or 3D/volume texture kind.** A canonical GPU texture library exposes 2D, 2D-array, 3D, and cube as first-class kinds. Only single-2D + cube exist. `Texture2DArray` (sprite layers, shadow cascades) and `Texture3D` (LUTs, volumetrics) are standard and roadmapped (Silver/Gold) but absent. Both cross into the renderer-upload layer, so the descriptor-ahead-of-consumer question is a design decision, not a sweep.
- **No descriptor-level format / usage / mip policy.** No `format: PixelFormat | null` hint, no `TextureMipPolicy` ('none'/'auto'/'manual') generation strategy beyond `Sampler.mipmaps`, and no `TextureUsage` ('sampled'/'render-target'/'storage') intent — even though `Texture.ts`'s own doc describes "a graph that renders into a Texture." `PixelFormat` exists in `@flighthq/types` but the descriptor does not reference it. A real texture library carries at least a format hint and a mip/usage policy. The status correctly parks all three as cross-package design gates (the `render-gl`/`render-wgpu` upload caches must agree on the field semantics first).
- **No per-binding dirty / version tracking.** No `version: number` on `Texture`/`CubeTexture` and no `invalidateTexture`/`invalidateCubeTexture` bump helpers. `equals*` gives a value-diff hook, but the established `ImageResource.version` convention (a cheap "re-upload me" signal) has no texture analogue. Parked in status as needing the renderer cache strategy confirmed.
- **uv-transform set is incomplete.** Compose (`getTextureUvMatrix`) and the setters exist, but `getTextureInverseUvMatrix`, `transformTextureUv(out, texture, u, v)`, and `resetTextureUvTransform(texture)` do not. These are pure in-package math with no design gate — the one genuinely sweep-safe depth item still open.
- **`*Kind` constants have no consumer.** `TextureKind`/`SamplerKind`/`CubeTextureKind` are defined in `@flighthq/types` but are referenced nowhere in the codebase (`grep` over `packages/` finds only the types `dist`). The entities extend `Entity`, not a kind-bearing descriptor — they carry no `kind` field — so nothing registers a renderer against these kinds and no serialization round-trips them. Defining the kind in the owning area ahead of the consumer is consistent with the types-layout convention, so this is a "data with no behavior yet" observation, not a defect; but the kinds are inert until a registry or a serialized-scene path consumes them.
- **No swizzle / channel-remap descriptor** (`TextureSwizzle` for packed data maps). Gold-tier, plain data, backend-applied — absent.

Reasonably **missing-by-design / delegated** (do not count against depth): pixel reads/writes/resize → `@flighthq/surface`; GPU upload + `WebGLTexture`/`GPUTexture` lifecycle + mip execution → `render-gl`/`render-wgpu`; decode/load → `resources`/`loader`; atlas packing → `resources`; compressed (KTX2/Basis) payloads → explicitly deferred at the `ImageResource`/`PixelFormat` level, and the `@flighthq/texture-formats` neighbor is blocked on that decision.

## Charter contradictions

None. The charter's only non-stub section ("What it is") describes exactly what the code is — the portable plain-data description of a texture binding, sitting between `@flighthq/resources` (pixels) and the renderer upload layer, explicitly _not_ pixel manipulation (`surface`) and _not_ the GPU upload layer. The code honors that boundary precisely: no pixel ops, no GPU handles, no decoding. The North star, Boundaries, and Decisions are all `TODO`, so there is no blessed rule to violate — which is itself the chief finding (see Candidate open directions).

## Contract & docs fit

**Lives up to the contract:** types-first in `@flighthq/types` (every interface + the two new constant files); full unabbreviated names (`getCubeTextureFaceSize`, not `getCubeFaceSize`; `setTextureUvOffset`, not `setUvOffset`); `out`-param for the one allocation-sensitive function (`getTextureUvMatrix`) with a documented no-alias note that is _honest_ here (the `out: Matrix3Like` and `texture: TextureLike` types cannot alias, and the comment says so rather than claiming a false alias-safety); `-1` sentinels for unbound dimensions; `equals*` returns `false` not throw for null operands; single `.` export; `sideEffects: false`; `crate: flighthq-texture` mirror named. Good contract hygiene overall.

**Defects / candidate revisions:**

- **Unused `@flighthq/resources` dependency.** `package.json` declares `"@flighthq/resources": "*"`, but no source file imports it — `ImageResource` is imported as a type from `@flighthq/types`, and a full `grep` over `packages/texture/src/` for `@flighthq/resources` finds nothing (`67dc46d64:packages/texture/package.json:32`). This inflates the dependency graph and would be flagged by `npm run packages:check`'s workspace-dependency conventions. Drop it — a pure manifest edit, sweep-safe.
- **`*Kind` constants defined but unconsumed (forward declaration).** Not a contract violation — the types-layout convention is to home a kind in the owning area — but worth recording that the texture package itself never references its own `*Kind` strings, and no `getTextureKind`/registration path uses them. They are inert until a renderer registry or a serialized-scene round-trip consumes them (Silver/cross-package).
- **`equalsSampler` null-guard order differs from the texture/cube siblings.** `equalsSampler` checks `a === b` _inside_ the value comparison (after the `!a || !b` early-`false`), so two distinct null operands return `false` (correct); `equalsTexture`/`equalsCubeTexture` put the same-reference fast path _after_ the null guard. The three are now consistent (all return `false` for null/undefined), which the status's "concerns" note describes accurately — no defect, recorded for continuity.
- **`faces` mutability cast.** `CubeTexture.faces` is typed `readonly (ImageResource | null)[]` but `copyCubeTexture` and `setCubeTextureFace` cast to `(ImageResource | null)[]` to mutate in place. The cast is sound (the array is always freshly `slice()`d/created in `createCubeTexture`/`cloneCubeTexture`, so it is never an aliased frozen array), but it relies on that invariant and is the one place the read-only type and the mutating function disagree. Documented in the source comment; recorded here as a continuity note, not a fix.
- **Package Map line is accurate** — the texture package is not separately enumerated in the codebase map's Package Map (it lives under the 3D `texture` family described in `rust/index.md`'s "3D pipeline" note). The charter's "What it is" is the authoritative description; no stale Package Map line to correct.

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** What is the durable bar? Likely: the portable, GPU-agnostic plain-data _description_ of a texture binding — descriptor-level intent (format/usage/mip/color-space/uv) with zero GPU handles and zero pixel ops — so every backend reads one model. Confirm so future work is judged against it.
2. **Kind taxonomy: how far does `texture` go?** Bless the canonical 2D / 2D-array / 3D / cube quartet as in-scope, and decide whether descriptors land ahead of their renderer-upload consumer or jointly with it. This is the single largest scope question.
3. **Format / usage / mip policy ownership and shape.** Whether `texture` owns `format`/`TextureMipPolicy`/ `TextureUsage` descriptor fields, and the cross-package contract with `render-gl`/`render-wgpu`/`scene-*` on what each means before the field shape is committed.
4. **Per-binding dirty/version signal.** Does `texture` carry `version` + `invalidate*` mirroring `ImageResource.version`, and do the renderers consume it for upload-cache invalidation? Cross-package.
5. **`*Kind` consumers.** Settle whether texture entities become kind-bearing descriptors that register renderers / round-trip in a serialized scene, or whether the `*Kind` constants stay forward declarations. Today they are defined but inert.
6. **`@flighthq/texture-formats` neighbor.** Approve/deny the KTX2/Basis container-parser neighbor, gated on the deferred `ImageResource.compressed` types decision (raise as a prerequisite).
7. **Rust parity scope.** The crate `flighthq-texture` exists with the base entities; confirm the conformance-map entry tracks the ~15 new TS additions (`equals_*`, `get_texture_uv_matrix`, the setters, `copy_cube_texture`, `set_cube_texture_face` + `CUBE_FACE_*`, the presets, the `*Kind` mirrors) so the port does not silently drift.
