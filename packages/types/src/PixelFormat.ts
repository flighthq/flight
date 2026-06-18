/**
 * Numeric layout of an `ImageResource`'s raw pixel `data`: channel order plus per-channel type.
 * Orthogonal to color space (`Surface.colorSpace`) and to file encoding (`ImageFormat`, e.g. PNG/JPEG).
 * Names follow WebGPU's `GPUTextureFormat` so a WebGPU backend maps a format 1:1 with no lookup table.
 *
 * Both variants are 8-bit unsigned-normalized RGBA in `Uint8ClampedArray` (4 bytes per pixel); they
 * differ only in channel order. `bgra8unorm` is reachable via `convertSurfacePixelOrder`. Wider
 * formats (float, single-channel R8, compressed KTX2/Basis) are out of scope until `data` can carry
 * them — compressed payloads are reserved for a separate `compressed` slot on `ImageResource`.
 */
export type PixelFormat = 'bgra8unorm' | 'rgba8unorm';
