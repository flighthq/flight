// Options for an ImageEncoder. quality is the lossy-format quality hint in [0, 1] (JPEG/WebP); lossless
// formats (PNG) ignore it.
export interface ImageEncodeOptions {
  quality?: number;
}
