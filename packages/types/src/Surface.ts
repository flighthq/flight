import type { ImageSource } from './ImageSource';

export interface Surface extends ImageSource {
  readonly colorSpace: 'srgb' | 'display-p3';
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}
