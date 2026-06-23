---
id: texture-formats
title: '@flighthq/texture-formats'
type: new-package
target: texture-formats
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/texture-formats.md
  - tools/agents/docs/reviews/breadth/asset-pipeline.md
depends_on: []
updated: 2026-06-23
---

## Summary

KTX2 / Basis Universal / DDS / PVR compressed-texture container parsing, transcode-target selection, mip-chain extraction, and per-backend upload of compressed blocks — the `-formats` neighbor of `@flighthq/texture`.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that turns "decoded RGBA only" into "GPU-native textures exist." Parse the two most common containers, select a transcode target, and upload compressed blocks on both GPU backends.

**Types (`@flighthq/types` first):**

- Add `compressed: CompressedTexture | null` slot to `ImageResource` (the already-reserved slot).
- `CompressedTexture` (Entity): `format: CompressedTextureFormat`, `width`, `height`, `levels: ReadonlyArray<CompressedTextureLevel>`, `alphaType`.
- `CompressedTextureLevel`: `data: Uint8Array<ArrayBuffer>`, `width`, `height`, `byteOffset`, `byteLength` (one mip level's blocks).
- `CompressedTextureFormat` (`*Kind`-style string union/open contract): `'bc1'|'bc3'|'bc7'|'etc2-rgb'|'etc2-rgba'|'astc-4x4'|'rgba8'` (the GPU-native block formats a transcode target resolves to). Open contract, not a closed enum.
- `TextureContainerFormat` string kind: `'ktx2' | 'dds'`.
- `TranscodeTarget`: the chosen `CompressedTextureFormat` plus whether fallback to uncompressed `rgba8` was taken.
- `GpuTextureCapabilities`: `Readonly` set of `CompressedTextureFormat` the active device supports (`bc`, `etc2`, `astc` families), queried from the render state.

**`@flighthq/texture-formats`:**

- `parseKtx2Texture(buffer: Readonly<ArrayBuffer>): CompressedTexture | null` — KTX2 header + mip-level offset table; returns `null` on a malformed/unsupported container (sentinel, not throw).
- `parseDdsTexture(buffer: Readonly<ArrayBuffer>): CompressedTexture | null` — DDS / DX10 header.
- `detectTextureContainerFormat(buffer: Readonly<ArrayBuffer>): TextureContainerFormat | null` — magic-byte sniff (KTX2 `«KTX 20»`, DDS `DDS `).
- `selectTranscodeTarget(source: Readonly<CompressedTexture>, capabilities: Readonly<GpuTextureCapabilities>): TranscodeTarget` — picks the best supported block format with documented preference order, falling back to `rgba8`.
- `getCompressedTextureLevelCount(texture: Readonly<CompressedTexture>): number`.
- `hasCompressedTextureAlpha(texture: Readonly<CompressedTexture>): boolean`.
- `loadCompressedTextureFromArrayBuffer(buffer, format?): Promise<ImageResource>` — produces an `ImageResource` with the `compressed` slot populated, paralleling `loadImageResourceFromArrayBuffer`.
- `loadCompressedTextureFromUrl(url, crossOrigin?): Promise<ImageResource>`.

**Renderer upload (in the render packages, listed here for completeness):**

- `getGlTextureCapabilities(state): GpuTextureCapabilities` / `getWgpuTextureCapabilities(state): GpuTextureCapabilities`.
- `uploadGlCompressedTexture(state, texture: Readonly<CompressedTexture>): WebGLTexture | null` — `compressedTexImage2D` per level (skips transcode when the device already supports the source format).
- `uploadWgpuCompressedTexture(state, texture: Readonly<CompressedTexture>): WgpuTextureEntry | null`.

**Effort:** medium. KTX2 + DDS parsing is well-specified; the bulk is the per-backend `compressedTexImage2D` / `GPUTexture` block-copy plumbing and the capability query.

### Silver

Competitive with `basis_universal` / KTX-Software tooling: the transcoder seam, the universal `UASTC`/`ETC1S` Basis path, full mip handling, and cross-backend consistency.

**Types (`@flighthq/types`):**

- `BasisTranscoderBackend` seam: `transcode(source: Readonly<BasisTexture>, target: CompressedTextureFormat): CompressedTexture | null`, `isReady(): boolean`, plus the format-support predicate. Lives in types as the header for the wasm backend.
- `BasisTexture` / `'etc1s' | 'uastc'` Basis internal modes; `TextureContainerFormat` extended with `'basis' | 'pvr'`.
- `TextureTranscodeOptions`: `mipmaps: boolean`, `preferHighQuality: boolean`, `flipY: boolean`, `srgb: boolean`.
- `CompressedTextureFormat` extended to the full block set: `bc4`/`bc5` (normal/data maps), `eac-r11`/`eac-rg11`, `astc-6x6`/`astc-8x8`, `pvrtc`.

**`@flighthq/texture-formats`:**

- `registerBasisTranscoder(backend: BasisTranscoderBackend): void` / `getBasisTranscoderBackend()` / `setBasisTranscoderBackend(backend | null)` — the swappable wasm seam; parsers work without it, transcoding requires it.
- `transcodeBasisTexture(source, target, options?): CompressedTexture | null` — delegates to the active backend; returns sentinel when no backend is registered.
- `parseBasisTexture(buffer): BasisTexture | null` (raw `.basis`) and KTX2-with-Basis-supercompression handling inside `parseKtx2Texture` (Zstd / ETC1S / UASTC supercompression).
- `parsePvrTexture(buffer): CompressedTexture | null` (PVR v3 container).
- `selectTranscodeTarget` upgraded with a **per-device preference matrix** (ASTC on mobile/Apple, BC on desktop, ETC2 on GLES, UASTC→BC7 for quality, ETC1S→BC1 for size) and a `colorSpace`-aware path (sRGB vs linear/normal maps choosing `bc5`/`eac`).
- `generateCompressedTextureMipChain` — when a container ships only level 0, derive missing mip dimensions/levels metadata (actual block generation deferred to the transcoder where it can).
- `getCompressedTextureByteSize(texture): number` and `getCompressedTextureFormatBlockSize(format): { blockWidth; blockHeight; bytesPerBlock }` — sizing for residency/cache accounting.
- `validateCompressedTexture(texture): TextureFormatIssue | null` — dimension/block-alignment/level-count checks; sentinel `null` when valid.

**Cross-backend / Rust:**

- A committed parity/conformance scene comparing a KTX2-decoded texture across `displayobject-gl` / `displayobject-wgpu` (and the `displayobject-skia` software reference once the compressed→RGBA decode path exists CPU-side).
- `decodeCompressedTextureToSurface(texture, target?): Surface | null` — CPU decode of compressed blocks to RGBA so the **software/skia** backend and headless capture/fingerprinting can consume compressed assets without a GPU.

**Effort:** large. The Basis transcoder wasm integration and the device preference matrix are the heavy items; the CPU block-decoders (BC1/BC3/BC7/ETC2) for the software path are bounded but numerous.

### Gold

The authoritative reference: every container, every block format, the writer side, full error reporting, exhaustive tests, and 1:1 Rust parity.

**Types (`@flighthq/types`):**

- `CompressedTextureFormat` exhaustive: full BCn (`bc1`–`bc7`), full ETC1/ETC2/EAC, full ASTC LDR/HDR block sizes, PVRTC1/2, plus float/HDR (`bc6h`, `astc-hdr`, `rgba16f`) for environment/IBL maps.
- `CubeTexture` `compressed` slot + array-texture / 3D-texture level types (`CompressedTextureArray`), so cubemaps and texture arrays (IBL, sprite arrays) are first-class.
- `TextureFormatIssue` open contract (malformed-header, unsupported-supercompression, block-misalignment, transcoder-missing) for structured, non-throwing diagnostics.
- `enableTextureFormatSignals` group payloads (`onTextureTranscodeProgress`, `onTextureTranscodeError`) for the long-running wasm transcode of large/streamed assets.

**`@flighthq/texture-formats`:**

- **Writers / round-trip** (matching the `*-formats` parse+serialize maturity signal): `serializeKtx2Texture(texture, options?): ArrayBuffer`, `serializeDdsTexture`, `encodeBasisTexture(surface, options): BasisTexture | null` (encoder backend seam) — so the SDK can _produce_ GPU-native assets, not only consume them.
- **Full supercompression:** Zstd and ZLIB decode inside KTX2, BasisLZ/ETC1S endpoint-selector handling, KHR_DF (Khronos Data Format) descriptor parsing for correct color-space/primaries.
- **Streaming / partial:** `parseKtx2TextureHeader(buffer): CompressedTextureHeader | null` and `loadCompressedTextureLevel(source, level)` for mip-streaming (load smallest mips first, stream detail), feeding a future residency/cache layer.
- **Complete CPU decoders** for every block format behind `decodeCompressedTextureToSurface`, making the software backend and headless capture format-complete; HDR/float decode included.
- `enableTextureFormatSignals(...)` + `disableTextureFormatSignals` in this package (signals owned by the package that owns the entity).
- `getTranscodeTargetPreferenceMatrix()` / `setTranscodeTargetPreference(...)` — overridable device-preference policy.
- Exhaustive colocated tests: one `*.test.ts` per source file, golden-vector tests per container/format (the KTX-Software conformance corpus), alias-safe out-params, sentinel-on-malformed coverage, and round-trip parse↔serialize tests.

**Rust (`flighthq-texture-formats`):**

- 1:1 conformance: same parsers (`ktx2`, `ddsfile`), `basis-universal`/`basisu` transcoder behind a `transcode` cargo feature (mirroring the wasm gate), block upload in `render-gl`/`render-wgpu` crates, CPU decoders for the `displayobject-skia` reference path.
- Committed conformance scenes per container (`texture_ktx2_etc1s`, `texture_dds_bc7`, …) paired by name with TS functional scenes; the value-typed leaf is fingerprint-comparable headlessly (the _mixable_ class — a future `texture-formats-rs` wasm drop-in is feasible).
- The intentional TS↔Rust divergences (e.g. transcoder vendor differences) recorded in the conformance divergence map.

**Effort:** very large, and the encoder/writer side plus exhaustive CPU block-decoders are the long tail. Order Gold after Silver's transcoder seam is proven on both backends.

## Boundaries

- **GPU handle ownership stays in the renderers.** This package produces `CompressedTexture` data and answers capability queries; `WebGLTexture`/`GPUTexture` creation and `compressedTexImage2D`/block-copy live in `@flighthq/render-gl` and `@flighthq/render-wgpu` (extending the existing `bindGlTexture`/`createWgpuTextureEntry` seam). Re-upload-on-invalidation uses the existing `ImageResource.version` mechanism.
- **Uncompressed image decode (PNG/JPEG/WebP) is not here.** That is the separate `@flighthq/image-codec` (`registerImageDecoder`) seam the same review requests. `texture-formats` is strictly the _compressed-container_ path; `selectTranscodeTarget`'s `rgba8` fallback hands off to the normal `ImageResource.data` path, it does not decode PNGs.
- **Atlas packing / region descriptors stay in `@flighthq/resources` / `@flighthq/texture`.** A compressed atlas is a `TextureAtlas` whose backing `ImageResource` carries a `compressed` slot — packing and region math do not change.
- **Texture/sampler entity types stay in `@flighthq/texture`.** This neighbor only adds the compressed-payload formats and parsers; it does not redefine `Texture`/`Sampler`/`CubeTexture`.
- **Resource loading/queue/retry/cache stays in `@flighthq/loader` / a future asset-cache.** `load*From*` constructors here are thin (parse + populate), matching `loadTextureAtlasFrom*`; concurrency, retry, dedup belong to the loader/cache layer.
- **Materials/PBR sampling stays in `@flighthq/materials` / `scene-*`.** This package does not interpret a texture's role (albedo vs normal vs ORM); it only flags `colorSpace`/`alphaType` so the consumer chooses the right block format.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Wasm transcoder packaging.** Basis transcoder wasm is ~1 MB. Is it a peer `@flighthq/texture-formats-basis` backend package (parallel to a `textshaper-harfbuzz`), or an opt-in entry within this package? The neighbor-package precedent and bundle-discipline rule both favor a **separate backend package**, keeping parsers in the always-present core. Confirm the split.
- **CPU block-decoder home.** Should `decodeCompressedTextureToSurface`'s per-format decoders live here, or in `@flighthq/surface`/`filters-surface` next to other CPU pixel work? Leaning here (they are format-specific to compressed containers), but it adds bytes to a package whose core is meant to be light.
- **`GpuTextureCapabilities` ownership.** Capability querying touches the render state, but the _type_ and the selection policy (`selectTranscodeTarget`) are backend-agnostic. Proposed split: type + selection in `texture-formats`, the `get*TextureCapabilities` query in each renderer. Confirm this does not invert the dependency (renderers may depend on `texture-formats`, not vice versa).
- **Color-space / KHR_DF authority.** KTX2 carries a full Khronos Data Format descriptor (primaries, transfer function). How much of it does Flight honor vs. collapse to the existing `colorSpace: 'srgb' | 'linear'`? Bronze can collapse; Gold should parse KHR_DF — decide where the line sits.
- **Streaming/residency seam.** Mip-streaming (`loadCompressedTextureLevel`) implies a residency/cache owner that does not yet exist (the review's missing asset-cache). Define the streaming API shape now, or defer until the cache package lands? Recommend defining the _parse-by-level_ primitives in Gold and leaving residency to the cache.
- **DDS legacy FourCC vs DX10.** DDS has both the legacy FourCC path and the modern DX10 header. Support both, or DX10-only with a documented sentinel for legacy? Mature tooling supports both; weigh effort against real-world `.dds` assets.

## Agent brief

> Create `@flighthq/texture-formats` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
