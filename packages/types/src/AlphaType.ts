/**
 * How an `ImageResource`'s pixels encode alpha. Orthogonal to channel layout (`PixelFormat`) and
 * color space (`Surface.colorSpace`): the same `rgba8unorm` data can be straight or premultiplied.
 * Modeled on Skia's `SkAlphaType`.
 *
 * - `straight`: RGB is independent of alpha (un-premultiplied). What browsers produce via
 *   `getImageData` and what the surface pixel API reads and writes. Flight's default.
 * - `premultiplied`: RGB has already been multiplied by alpha. What renderers store in GPU textures
 *   and what the premultiplied (`ONE, ONE_MINUS_SRC_ALPHA`) blend expects. Produced by
 *   `premultiplySurfacePixels`.
 * - `opaque`: alpha is implicitly 1 everywhere; RGB is valid and the alpha channel can be ignored.
 *   A fast-path hint, never an obligation — `straight`/`premultiplied` data that happens to be fully
 *   opaque is still correct, just not flagged.
 */
export type AlphaType = 'opaque' | 'premultiplied' | 'straight';
