// The GPU texture format carried by a texture container (KTX2 / DDS / Basis / ATF). This is the format the
// level byte ranges are already encoded in — what a GL/WGPU backend hands to `texImage2D` /
// `copyExternalImageToTexture` as an internal format, or what a transcoder reads as its source. It is
// deliberately distinct from `PixelFormat` (the 8-bit RGBA layout of a decoded `ImageResource`): a
// container carries block-compressed data GPUs consume directly, which never lands in an
// `ImageResource.data` buffer.
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
