import type { ImageResource } from './ImageResource';

/**
 * An `ImageResource` whose pixels are guaranteed to live in CPU `data` (narrowed to non-null), with a
 * color space and the pixel-manipulation API built on top. Use a Surface when you read or generate
 * pixels directly; use a plain `ImageResource` when the pixels live only in an uploadable element.
 */
export interface Surface extends ImageResource {
  readonly colorSpace: 'srgb' | 'display-p3';
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}
