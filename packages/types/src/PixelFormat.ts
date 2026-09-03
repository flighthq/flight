/**
 * Numeric layout of a `Bitmap`'s raw pixel `data`: channel order plus per-channel type.
 * Orthogonal to color space (`TextureSource.gamut`) and to file encoding (`ImageFormat`, e.g. PNG/JPEG).
 * Names follow Wgpu's `GPUTextureFormat` so a Wgpu backend maps a format 1:1 with no lookup table.
 *
 * Both variants are 8-bit unsigned-normalized RGBA in `Uint8ClampedArray` (4 bytes per pixel); they
 * differ only in channel order. `bgra8unorm` is reachable via `convertBitmapPixelOrder`. Wider
 * formats (float and single-channel R8) are out of scope; block-compressed payloads use the sibling
 * `CompressedImageResource` backing.
 */
export type PixelFormat = 'bgra8unorm' | 'rgba8unorm';
