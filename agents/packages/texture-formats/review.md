---
package: '@flighthq/texture-formats'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - status.md
  - source
  - charter.md
  - assessment.md
---

# texture-formats — Review

**Verdict:** solid — 78/100. All four chartered containers (KTX2, DDS, Basis, ATF) parse into the common `TextureContainer` descriptor with correct sentinel-null handling, strong synthetic-buffer tests, and — for Basis — fixture expectations measured from real files. The Basis parser was corrected to match the published basisu packed layout (24-bit fields, 23-byte slice descriptors), the `explainTextureContainerParse` diagnostic closes the diagnostics-inversion gap, and the level-layout helpers are now root exports. The package is well-bounded and internally consistent. Remaining gaps are largely decision-gated or cross-package: ATF JPEG-XR identify-only behavior, KTX2 SGD/DFD exposure for transcoders, DDS volume textures, and the missing raw mobile containers (PKM/PVR/.astc).

## Present capabilities

- **`detectTextureContainer`** (`detectTextureContainer.ts`) — magic-byte sniff returning `TextureContainerKind | null` (`'ktx2' | 'dds' | 'basis' | 'atf'`); the single container-identification entry point. Handles too-short buffers and partial-magic lookalikes (tested).
- **`parseKtx2`** (`parseKtx2.ts`) — 12-byte identifier, fixed header, level index. Curated `vkFormat` table (~60 codes: uncompressed 8-bit/float, full BC1-7 with sRGB/snorm twins, ETC2/EAC, all 14 ASTC LDR block sizes). Supercompression map (None/BasisLZ/Zstd/ZLIB); `vkFormat 0` maps to `etc1s` (BasisLZ) or `uastc`. Non-supercompressed multi-image levels split into per-`(layer, face)` sub-images and normalized from KTX2 mip-major file order into the canonical layer-face-mip order; supercompressed levels stay as one blob (documented). Level ranges are bounds-checked against the buffer.
- **`parseDds`** (`parseDds.ts`) — `DDS_HEADER` + `DDS_HEADER_DXT10` extension. Format via the DXGI table (~22 codes), the FourCC table (DXT1-5, ATI1/2, BC4/5 U/S, D3DFMT 113/116 float), or 32-bit RGBA/BGRA channel masks. Cubemaps (caps2 + DX10 miscFlag), array layers via DX10 `arraySize`. Level ranges computed via `computeTextureContainerLevels` in D3D subresource order (layer-face-mip). Volume textures explicitly rejected (`null`).
- **`parseBasis`** (`parseBasis.ts`) — `.basis` signature, header fields matching the published basisu `basis_file_header`/`basis_slice_desc` packed layout: 24-bit `m_total_slices`/`m_total_images` at offsets 14/17, `m_tex_format` at 20, `m_slice_desc_file_ofs` at 65, 23-byte slice descriptors with 24-bit `m_image_index`. Handles ETC1S/UASTC. Maps `m_tex_type` to the `TextureContainer` shape: 2D/array as layers, cubemap-array as 6 faces with array-layer count, volumes as depth. Video frames are rejected (the common descriptor cannot truthfully represent temporal semantics). Slice ranges are bounds-checked.
- **`parseAtf`** (`parseAtf.ts`) — the blessed peer-array shape (`TextureContainer[] | null`, Decision 2026-07-11): versioned (`0xFF` marker) + legacy version-0 headers, u24/u32 big-endian block lengths, fixed DXT/ETC1/PVRTC(/ETC2 from v3) slot order, cube flag, populated-mip counting (handles png2atf "empty mipmaps" files), payload-length and per-block overrun checks. Only the raw-compressed format codes are supported (2/3/12 opaque, 4/5/13 with alpha); raw-BGRA (0/1) and JPEG-XR/LZMA-wrapped variants return `null`.
- **`selectTextureContainer`** (`selectTextureContainer.ts`) — the consumer side of the peer array: returns the first container whose format the caller's GPU supports. Format-agnostic; works on any `TextureContainer[]`.
- **`explainTextureContainerParse`** (`explainTextureContainerParse.ts`) — the `explain*` diagnostic. Returns a `TextureContainerParseExplanation` with `container` (which container was detected, or `null`) and `reason` (`container-unrecognized`, `header-truncated`, `format-unsupported`, `structure-invalid`, `level-range-out-of-bounds`). Returns `null` when parsing succeeds. Delegates to per-parser `get*ParseFailureReason` functions that share the same internal parse path. Separately importable; does not change the `null` sentinel contracts of the parsers.
- **`computeTextureContainerLevels`** and **`getTextureContainerLevelByteLength`** (`textureLevelLayout.ts`) — block-size-aware mip-chain layout. Root-exported since the assessment's [2026-07-22] approval. The `formatBlockInfo` table is an exhaustive `Record<TextureContainerFormat, ...>` so the compiler flags any new format lacking block sizing. `etc1s` is deliberately `null` (variable-rate).
- **Internal primitives** — `byteReader.ts` (guarded LE/BE cursor with u8/u16/u24/u32/u64; u64 as sub-2^53 number) and the format block-info table. Neither is barrel-exported. `ByteReader` interface itself lives in `@flighthq/types/contract`.
- **Header types** — `TextureContainer`, `TextureContainerFormat` (~55 members), `TextureContainerLevel`, `TextureContainerSupercompression`, `TextureContainerKind`, `TextureContainerParseExplanation`, `TextureContainerParseFailureReason`, and `ByteReader` all live in `@flighthq/types` per Decision 2026-07-10, each with durable semantic comments.
- **Tests** — 9 colocated test files covering all 9 implementation files. ~75 `it()` calls expanding to ~93 test runs via `it.each`. Basis tests include 11 fixture expectations measured from real `.basis` files (pinned to a release manifest SHA256) and 5 explicitly declined fixtures for unsupported tex_format values. Every parser tests happy paths, cubemaps/mips/arrays, and malformed input (non-magic, truncated, unknown format, range overrun). The `parseAtf` suite validates cross-platform multi-slot ATF, single-slot drop, empty-mipmaps, cube, legacy v0 headers, and block-length overruns. The `parseKtx2` suite now covers Zstd/ZLIB supercompression with multi-layer containers and mip-major-to-canonical reordering for both cubemaps and arrays.

## Gaps

- **No real-file validation for KTX2, DDS, or ATF.** The Basis parser has fixture expectations from real files; the other three are tested only against synthetic byte buffers constructed in the tests. There are no committed fixtures from `toktx`, `texconv`, or `png2atf`, and the repo's license-provenance rules discourage vendoring third-party binaries without a fixture policy. This is the clearest remaining correctness risk for the non-Basis parsers.
- **KTX2 skips the DFD, key/value data, and supercompression global data.** ASTC sRGB vkFormat codes collapse onto unorm (the vocabulary keys ASTC by block size, not color space). ETC1S-vs-UASTC is inferred from the supercompression scheme rather than the DFD colorModel. The SGD byte range (BasisLZ codebooks a transcoder needs) is not exposed, which weakens the chartered "route a level to a transcoder" story. `KTXorientation`/`KTXswizzle` are dropped.
- **DDS coverage is curated, not complete.** No volume (3D) textures (rejected; `TextureContainer.depth` exists but `TextureContainerLevel` has no depth/slice granularity). No legacy luminance/16-bit/565/24-bit masks, no R16F/RG16F/R32F/RGB10A2/BGRX DXGI codes, no HDR ASTC. A typical DDS reader (texconv/DirectXTex-level) covers these.
- **ATF raw-BGRA (codes 0/1) and JPEG-XR/LZMA-wrapped variants return `null`** — see charter contradiction below for the JPEG-XR half.
- **Missing raw mobile containers** — PKM (ETC), PVR v3, `.astc` — already charter Open direction 2.
- **No cross-container `(mip, layer, face)` addressing** — `levels` is flat with per-container nesting order; already charter Open direction 6.
- **`detectTextureContainer` return type is an inline string literal** — the `TextureContainerKind` named type exists in `@flighthq/types/contract` and is used in the function signature, but the function implementation returns string constants; that is fine structurally, though `TextureContainerKind` is not re-exported from the public `.` lane in `@flighthq/types` `index.ts` (it is contract-only). This is correct by the export-lanes convention since only other `@flighthq/*` packages need the union as a named type.

## Charter contradictions

One, unchanged from the prior review: Decision 2026-07-11 blesses ATF "JPEG-XR/JPEG fallback blocks are **identify-only** (locate the byte range)", but `parseAtf` rejects the JPEG-XR/LZMA-wrapped format codes outright (`null`), so the blessed identify-only behavior is unimplemented. The assessment parks this in Backlog with a clear rationale: a JPEG-XR block has no `TextureContainerFormat` (the vocabulary describes GPU-consumable formats), so implementing it requires a vocabulary ruling first (candidate open direction 3 below). Everything else conforms: peer-array ATF return, single-format `TextureContainer`, no-transcode boundary, types-only deps, sentinel nulls.

## Contract & docs fit

- **Types-first design:** the descriptor quartet (`TextureContainer`, `TextureContainerFormat`, `TextureContainerLevel`, `TextureContainerSupercompression`) plus the diagnostics types (`TextureContainerParseExplanation`, `TextureContainerParseFailureReason`, `TextureContainerKind`) and `ByteReader` all reside in `@flighthq/types`. The implementation package exports only functions.
- **Naming:** full unabbreviated names throughout (`parseKtx2`, `selectTextureContainer`, `getTextureContainerLevelByteLength`, `explainTextureContainerParse`, `computeTextureContainerLevels`). Globally unique and self-identifying.
- **Sentinels-not-throws:** guarded reads prevent `DataView` throws; every parser returns `null` on malformed input. The `explainTextureContainerParse` companion satisfies the diagnostics-inversion mandate for the silent sentinels.
- **Export lanes:** root `.` (`index.ts`) re-exports the public API from `./contract` (`contract.ts`). Both lanes exist and carry the same set of functions. `"sideEffects": false` declared.
- **Dependency:** `@flighthq/types` is the sole dependency. No DOM, no GPU, no renderer coupling.
- **`Readonly<>` usage:** inputs are marked `Readonly<Uint8Array>`. Lookup tables use `Readonly<Record<...>>` and `ReadonlySet`. The `formatBlockInfo` table is an exhaustive `Record<TextureContainerFormat, ...>`.
- **Source style:** exported functions are alphabetized within each file. Module constants and internal helpers sit at the bottom, after exported functions. Tests are colocated (`*.test.ts`), `describe` blocks mirror exported names.
- **`package.json` description** — now reads "KTX2 / DDS / Basis / ATF" with peer selection and level layout, matching the implemented scope.
- **Barrel question resolved:** `computeTextureContainerLevels` and `getTextureContainerLevelByteLength` are now root exports (assessment [2026-07-22] approval). `byteReader` staying internal is correct.
- **Color-space asymmetry:** ASTC sRGB vkFormat codes collapse onto unorm block names while BC/ETC2 keep sRGB twins. This is a deliberate vocabulary choice (ASTC is keyed by block size, not color space), documented in the KTX2 vkFormat table comment. Whether it is the right long-term choice is a candidate open direction.

## Candidate open directions

1. **Real-file fixture expectations for KTX2, DDS, and ATF** — Basis now has measured fixture expectations; extending the same pattern to the other parsers would close the largest remaining correctness gap. Requires a fetch-on-demand fixture policy (consistent with the license-provenance rules — commit the expectations, not the binaries).
2. **Transcoder handoff completeness for KTX2 BasisLZ** — the descriptor does not expose the SGD/DFD byte ranges a transcoder needs. Ties to charter Open direction 1 (transcoder seam) and changes the `TextureContainer` descriptor shape in `@flighthq/types`. Cross-package + design fork.
3. **JPEG-XR identify-only representation** — what does an identify-only, non-GPU-format ATF block carry as `format`? Needs a vocabulary ruling before the blessed ATF behavior can land. The assessment parks this correctly.
4. **Color-space axis in the format vocabulary** — ASTC sRGB collapses onto unorm while BC/ETC2 keep sRGB twins; is that asymmetry the intended final shape?
5. **DDS/DXGI vocabulary expansion** (R16F/RG16F/R32F/RGB10A2/BGRX, legacy luminance/565 masks, HDR ASTC) — each new format is a `TextureContainerFormat` member in `@flighthq/types`; vocabulary growth has been decision-gated. Cross-package.
6. **DDS volume (3D) textures** — `TextureContainer.depth` exists but `TextureContainerLevel` has no depth/slice granularity; supporting them cleanly touches charter Open direction 6.
