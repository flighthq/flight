import type { Entity } from './Entity';
import type { PixelFormat } from './PixelFormat';
import type { TextureSourceKind } from './TextureSourceKind';

// CPU source for a volume texture. Bitmap remains the bytes-guaranteed two-dimensional pixel API;
// volumes carry their own byte layout and revision counter.
export interface TextureVolume extends Entity {
  data: Uint8Array<ArrayBuffer>;
  depth: number;
  format: PixelFormat;
  height: number;
  kind: TextureSourceKind;
  version: number;
  width: number;
}
