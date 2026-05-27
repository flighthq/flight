export interface ImageData {
  readonly colorSpace: 'srgb' | 'display-p3';
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly height: number;
  readonly width: number;
}
