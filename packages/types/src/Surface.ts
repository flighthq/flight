import type { ImageResource } from './ImageResource';

export interface Surface extends ImageResource {
  readonly colorSpace: 'srgb' | 'display-p3';
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}
