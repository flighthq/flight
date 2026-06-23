# Depth Review: @flighthq/texture

**Domain:** GPU texture bindings for a 3D/material pipeline — the data descriptors that tell a renderer _how_ to read an image as a texture (sampling state, color space, uv-transform) and the cubemap aggregate, sitting between `@flighthq/resources` (the pixel source) and the material/renderer layer (the backend that uploads and samples). It is explicitly **not** a pixel-manipulation library (that is `@flighthq/surface`) and not the GPU upload layer (that is `render-gl` / `render-wgpu`'s `*Texture` entries).

**Verdict:** solid — **62/100**

The package is small but complete _for the seam it occupies_. Its scope is "the portable, plain-data description of a texture binding," and within that narrow charter it is coherent and well-modeled (the three canonical entities Texture / Sampler / CubeTexture, each with the create/clone/copy quartet the codebase mandates). It falls short of "authoritative texture library" because a mature texture library in a 3D SDK is expected to carry meaningfully more of the texture domain — texture-array / 3D-volume kinds, descriptor-level mip and format/usage policy, equality/dirty tracking across all three entities, and the canonical-face/uv-transform helper math — most of which is currently absent rather than delegated.

## Present capabilities

- **Texture entity** (`createTexture`, `cloneTexture`, `copyTexture`, `setTextureImage`, `isTextureReady`). Models the universal image→material bridge: `image` (nullable `ImageResource` slot), `sampler`, `colorSpace` (`'srgb'` | `'linear'`), and the full KHR_texture_transform set (`uvOffset`, `uvRotation`, `uvScale`). Defaults are deliberate and correct: `'srgb'` albedo default, identity uv-transform, default sampler. Clone semantics are documented precisely (image reference shared; sampler and uv vectors deep-cloned), and `copyTexture` is alias-safe.
- **Sampler entity** (`createSampler`, `cloneSampler`, `copySampler`, `equalsSampler`). Covers the canonical GL/Wgpu sampler state: per-axis wrap (`wrapU`/`wrapV` over clamp/mirror/repeat), `minFilter`/`magFilter` over the full six-mode filter enum incl. mip-aware modes, `mipmaps` toggle, and `anisotropy` (1 = off). AAA-correct defaults (clamp-to-edge, linear mag, trilinear min, mipmaps on). `equalsSampler` enables sampler de-duplication/caching, which is the right hook for backends.
- **CubeTexture entity** (`createCubeTexture`, `cloneCubeTexture`). Six faces in canonical +X,-X,+Y,-Y,+Z,-Z order, shared sampler + color space; faces array is copied on create/clone so a clone's face reassignment does not alias the source.
- **Style conformance:** plain-data entities, free functions, `Readonly<>` inputs, out-params, sentinel-free design, full create/clone/copy coverage on the two primary entities, side-effect-free. Types live in `@flighthq/types` (the header layer). Tree-shakable and dependency-light.

## Gaps vs an authoritative texture library

Missing-by-omission (would be expected in a mature texture library and are not delegated elsewhere):

- **No texture-array or 3D/volume texture kind.** A canonical GPU texture library exposes 2D, 2D-array, 3D, and cube as first-class kinds. Only single-2D + cube exist. 2D-array (sprite layers, shadow cascades) and 3D (LUTs, volumetrics) are standard.
- **No equality / dirty comparison for Texture or CubeTexture.** `equalsSampler` exists, but there is no `equalsTexture` / `equalsCubeTexture` and no version/dirty/invalidation field. Backends that cache GPU uploads need to detect when a binding's sampler/uv/image changed; that detection is left entirely to consumers.
- **No uv-transform math.** The KHR_texture_transform fields are stored but there is no helper to compose them into the 3×3 / mat-like form a shader consumes (e.g. `getTextureUvMatrix(out, texture)`), nor setters like `setTextureUvScale` / `setTextureUvOffset`. A material/renderer must reimplement the transform assembly per backend — exactly the kind of shared math this package should own.
- **No cube-face accessors/mutators.** `setCubeTextureFace(cube, faceIndex, image)`, an `isCubeTextureComplete` readiness gate (parallel to `isTextureReady`), and named face constants (`CubeFacePositiveX` …) are all absent; callers index the raw `faces` array by magic number.
- **No descriptor-level format/usage/mip policy.** No notion of intended texture format, sRGB-view vs linear-view, render-target/usage intent, or mip-generation strategy beyond the boolean `mipmaps`. `PixelFormat` exists in `@flighthq/types` but the Texture descriptor does not reference a desired format. A real texture library carries at least a format hint and a mip-count/auto-mip policy.
- **No copy for CubeTexture.** `cloneCubeTexture` exists but there is no `copyCubeTexture` (in-place), breaking the create/clone/copy symmetry the codebase enforces for the other two entities.
- **No sampler presets / common bindings.** No named convenience samplers (e.g. nearest-clamp pixel-art sampler, repeat-trilinear tiling sampler) — minor, but a mature library typically offers a few canonical sampler presets.

Reasonably **missing-by-design / delegated** (do not count heavily against depth):

- Pixel reads/writes, resize, color conversion → `@flighthq/surface`.
- Actual GPU upload, `WebGLTexture` / `GPUTexture` lifecycle, mip generation execution → `render-gl` / `render-wgpu`.
- Image decoding/loading → `@flighthq/resources` / `@flighthq/loader`.
- Atlas/region packing → `@flighthq/resources` (`TextureAtlas`).
- Compressed (KTX2/Basis) payloads — explicitly deferred at the `ImageResource`/`PixelFormat` level per the type docs.

## Naming / API-shape notes

- Naming is clean and codebase-canonical: full unabbreviated type words, `create/clone/copy` verbs, `is*` boolean prefix. `isTextureReady`, `setTextureImage`, `equalsSampler` all read well and are globally self-identifying.
- Asymmetry to fix: Sampler has `equalsSampler` but Texture/CubeTexture have no `equals*`; CubeTexture has `clone*` but no `copy*`; Texture has `isTextureReady` but CubeTexture has no readiness gate. The three entities should expose the same quartet + equality + readiness where applicable.
- The uv-transform lives as loose fields on `Texture` with no operating functions — the package stores a transform model it provides no API to use. Either add the compose/setter helpers or document the math contract; today it is data with no behavior.
- `createTexture`/`createCubeTexture` correctly clone/copy supplied sub-objects (sampler, uv vectors, faces) rather than aliasing caller input — good ownership hygiene that matches the entity model.

## Recommendation

Treat this as a **solid but under-built leaf**, not authoritative. It is a correct, well-styled foundation for the texture-binding seam, but to reach AAA texture-library completeness it should grow within the session scope: add `equalsTexture` / `equalsCubeTexture`, `copyCubeTexture`, `isCubeTextureComplete`, `setCubeTextureFace` + named face constants, uv-transform helpers (`getTextureUvMatrix`, `setTextureUvScale/Offset/Rotation`), and a format/mip-policy hint on the descriptor. The larger additions — a 2D-array / 3D-volume texture kind and a per-texture version/dirty field for upload caching — are design decisions that cross into the renderer/types layer and should be surfaced to the user rather than added autonomously. The current surface is the right shape but roughly two-thirds of the canonical texture-domain depth.
