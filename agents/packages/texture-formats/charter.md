---
package: '@flighthq/texture-formats'
crate: flighthq-texture-formats
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# texture-formats — Charter

## What it is

`@flighthq/texture-formats` is the **GPU texture-container codec** — it parses the container formats GPUs consume directly (KTX2, DDS, and the Basis Universal `.basis` container) into a described texture: dimensions, format, mip chain, array/cube layers, and the raw per-level byte ranges, without decoding the compressed pixel payload. A codec neighbor of the image/texture stack, tree-shakable off the runtime, matching `image-codec`/`path-formats`.

It is the **container** layer: it tells you *what* is in the file and *where each level is*. Actually **transcoding** Basis/UASTC/BCn payloads to a runtime format is compute-heavy and is a Rust/wasm concern — that lives in the spun-out `flight-rs` (per the `surface-rs`/wasm split), not here.

## North star

Complete container coverage: **KTX2** (the modern Khronos container — header, DFD, level index, Basis/UASTC/BCn/ASTC/ETC payload identification, supercompression scheme flags), **DDS** (the DirectX container — `DDS_HEADER` + `DXT10` extension, BCn/legacy formats, cubemaps, mip chains), and the **Basis** container header — each parsed into a common `TextureContainer` descriptor (`format`, `width`/`height`/`depth`, `mipLevels`, `layers`, per-level `{ byteOffset, byteLength }`). `parseKtx2`/`parseDds`/`parseBasis` producing that descriptor; the caller hands level byte-ranges to a GPU upload or a `flight-rs` transcoder.

## Boundaries

- **Depends on `@flighthq/types` only.** The container-format vocabulary (`TextureContainerFormat`) lives in the header, and the parsers sniff their own magic bytes locally, so no code-level `@flighthq/image-codec` use exists today — it was dropped from deps to keep them honest (mirrors the glyphatlas unused-dep cleanup). Folding `detectTextureContainer` into `image-codec`'s MIME/detect dispatcher is an Open direction, not a current dep. No DOM, no GPU, no renderer.
- **Container parsing, not transcoding.** It identifies formats and locates level byte-ranges; it does **not** transcode Basis/UASTC → BCn/ASTC or decode BCn → RGBA (compute-heavy, Rust/wasm → `flight-rs`). A GL/WGPU backend uploads a natively-supported level directly; an unsupported one is routed to a transcoder the caller supplies.
- **Read-first.** Parse is the priority; writing/repacking containers is a later open direction.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] KTX2 + DDS + Basis container parse; NO transcode.** `parseKtx2(bytes): TextureContainer | null`, `parseDds(bytes): TextureContainer | null`, `parseBasis(bytes): TextureContainer | null` (+ `detectTextureContainer` magic-byte sniff), each returning a `TextureContainer` descriptor with per-level byte ranges. Sentinel `null` on malformed/unknown input. Transcoding is explicitly out of scope (wasm → `flight-rs`); the descriptor exposes what's needed to route a level to a transcoder or a direct upload.
- **[2026-07-10] `TextureContainer` + `TextureContainerFormat` in `@flighthq/types`.** The descriptor and the format enum (BCn/ASTC/ETC/UASTC/Basis/uncompressed) live in the header so `image-codec`, the renderers, and a `flight-rs` transcoder share one vocabulary.

## Open directions

1. **Transcoder seam.** A `TextureTranscoderBackend` interface (implemented in `flight-rs` via wasm) that takes a Basis/UASTC level + a target GPU format and returns transcoded bytes — the bridge to the compute-heavy layer, defined here, implemented there.
2. **PKM/PVR/ASTC raw containers** — the remaining mobile/embedded container formats.
3. **Write/repack** — emit KTX2 from a level set (offline atlas/texture-array baking).
4. **`image-codec` detect integration.** Register `detectTextureContainer` behind `image-codec`'s MIME/detect dispatcher so a single sniff routes image *and* GPU-container bytes — the moment a real code-level dep would earn its place.
5. **Validate Basis offsets against a real `.basis` file.** The `basis_file_header`/`basis_slice_desc` field offsets are reconstructed from the spec, not confirmed against a real container — the highest-risk parse path.
6. **Level index granularity.** `TextureContainerLevel` carries no explicit `(mip,layer,face)` triple; ordering is per-container-documented (KTX2 mip→layer→face, DDS layer→face→mip, Basis slice order). A cross-container index→face mapping helper would remove the need to know the source nesting.
