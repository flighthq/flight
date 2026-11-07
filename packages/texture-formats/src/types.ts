// The texture-formats-owned container contracts in an acyclic lane. Contract-only projects select this
// file through the `.texture-formats-types` module suffix.

// The GPU texture format carried by a texture container (KTX2 / DDS / Basis / ATF). This is the format the
// level byte ranges are already encoded in — what a GL/WGPU backend hands to `texImage2D` /
// `copyExternalImageToTexture` as an internal format, or what a transcoder reads as its source. It is
// deliberately distinct from `PixelFormat` (the 8-bit RGBA layout of a decoded `Bitmap`): a container
// carries block-compressed data GPUs consume directly.
//
// Names are canonical, backend-neutral, and shared across `image-codec`, the renderers, and a
// `flight-rs` transcoder so vkFormat / DXGI / FourCC codes all normalize to one vocabulary. `Srgb`
// suffixes mark the sRGB-encoded twin of an unorm format; `Snorm`/`Ufloat`/`Sfloat` mark signed and
// float block variants. `etc1s` and `uastc` are the two intermediate formats a Basis payload (a
// `.basis` file or a BasisLZ-supercompressed KTX2 level) decodes from — a transcoder turns them into a
// concrete BCn/ETC/ASTC format at upload time.
export type TextureContainerFormat =
  // Uncompressed
  | 'rgba8unorm'
  | 'rgba8Srgb'
  | 'bgra8unorm'
  | 'bgra8Srgb'
  | 'r8unorm'
  | 'rg8unorm'
  | 'rgba16f'
  | 'rgba32f'
  // BC (S3TC / RGTC / BPTC)
  | 'bc1'
  | 'bc1Srgb'
  | 'bc2'
  | 'bc2Srgb'
  | 'bc3'
  | 'bc3Srgb'
  | 'bc4'
  | 'bc4Snorm'
  | 'bc5'
  | 'bc5Snorm'
  | 'bc6hUfloat'
  | 'bc6hSfloat'
  | 'bc7'
  | 'bc7Srgb'
  // ETC / EAC
  | 'etc1'
  | 'etc2Rgb'
  | 'etc2RgbSrgb'
  | 'etc2Rgba'
  | 'etc2RgbaSrgb'
  | 'etc2RgbA1'
  | 'etc2RgbA1Srgb'
  | 'eacR11'
  | 'eacR11Snorm'
  | 'eacRg11'
  | 'eacRg11Snorm'
  // PVRTC v1 (PowerVR, iOS) — keyed by bit rate and color channels
  | 'pvrtc2bppRgb'
  | 'pvrtc2bppRgba'
  | 'pvrtc4bppRgb'
  | 'pvrtc4bppRgba'
  // ASTC (LDR, keyed by block size)
  | 'astc4x4'
  | 'astc5x4'
  | 'astc5x5'
  | 'astc6x5'
  | 'astc6x6'
  | 'astc8x5'
  | 'astc8x6'
  | 'astc8x8'
  | 'astc10x5'
  | 'astc10x6'
  | 'astc10x8'
  | 'astc10x10'
  | 'astc12x10'
  | 'astc12x12'
  // Basis universal intermediate formats (transcoded to a concrete format on upload)
  | 'etc1s'
  | 'uastc';

export type TextureContainerKind = 'atf' | 'basis' | 'dds' | 'ktx2';

// One contiguous sub-image inside a texture container's payload: a single mip level of a single
// face/layer, and where its bytes live in the source buffer. This is exactly what a GPU upload needs
// to `texImage2D`/`writeTexture` one image, or what a transcoder reads as one input slice.
//
// `byteOffset`/`byteLength` are absolute into the container's byte buffer and address the data as
// stored: if the enclosing level is supercompressed (see `TextureContainerSupercompression`), the
// range is the still-wrapped payload, not the inflated size. `width`/`height` are this mip's pixel
// dimensions (already halved per level, floored at 1), not the block-padded dimensions.
export interface TextureContainerLevel {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
}

// The KTX2 supercompression scheme wrapping each level's payload (KTX2 spec §3.11). A lossless outer
// layer that must be inflated before the level bytes are the `TextureContainerFormat` data: `'None'`
// means the level bytes are directly the format data; the others wrap it. `'BasisLZ'` is the Basis
// ETC1S codec (transcoded, not merely inflated); `'Zstd'` and `'ZLIB'` are generic block deflators.
//
// A container parser reports the scheme and the raw (still-wrapped) level byte ranges — it never
// inflates or transcodes them. Handing a supercompressed level to a GPU upload requires the caller to
// inflate it first (Zstd/ZLIB) or route it through a Basis transcoder (BasisLZ). DDS and the `.basis`
// container have no supercompression layer and always report `'None'`.
export type TextureContainerSupercompression = 'None' | 'BasisLZ' | 'Zstd' | 'ZLIB';

export type TextureContainerParseFailureReason =
  | 'container-unrecognized'
  | 'format-unsupported'
  | 'header-truncated'
  | 'level-range-out-of-bounds'
  | 'structure-invalid';

// A parsed GPU texture container (KTX2 / DDS / Basis): what format it holds, its full dimensions, and
// where every sub-image lives — without decoding the compressed payload. The common descriptor all
// three `parse*` front-ends produce, so a caller routes level byte ranges to a GPU upload or a
// `flight-rs` transcoder against one shape regardless of source container.
//
// `width`/`height`/`depth` are the base (mip 0) dimensions (`depth` is 1 for 2D). `mipLevels`,
// `layers` (array slices; 1 for non-array), and `faces` (6 for a cubemap, else 1) give the container's
// shape. `levels` is the canonical layer → face → mip flat list of every stored sub-image
// (`mip + (face + layer * faces) * mipLevels`): for a non-supercompressed container it holds
// `mipLevels * layers * faces` entries (each face/layer split out as its own contiguous range);
// for a supercompressed KTX2 it holds one entry per mip level covering the whole compressed blob
// (a supercompressed level cannot be split per image without inflating it first). Parsers normalize
// source-native ordering to this contract while preserving each entry's original byte range.
export interface TextureContainer {
  readonly format: TextureContainerFormat;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly mipLevels: number;
  readonly layers: number;
  readonly faces: number;
  readonly supercompression: TextureContainerSupercompression;
  readonly levels: readonly TextureContainerLevel[];
}

export interface TextureContainerParseExplanation {
  readonly container: TextureContainerKind | null;
  readonly reason: TextureContainerParseFailureReason;
}
