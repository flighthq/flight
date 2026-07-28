import type { Entity } from './Entity';
import type { PixelFormat } from './PixelFormat';
import type { TextureBackingKind } from './TextureBackingKind';

// CPU backing for a volume texture. Surface remains the bytes-guaranteed two-dimensional pixel API;
// volumes carry their own byte layout and revision counter.
export interface TextureVolume extends Entity {
  data: Uint8Array<ArrayBuffer>;
  depth: number;
  format: PixelFormat;
  height: number;
  kind: TextureBackingKind;
  version: number;
  width: number;
}
