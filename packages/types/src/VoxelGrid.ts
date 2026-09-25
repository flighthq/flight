import type { PixelFormat } from './PixelFormat.ts';
import type { TextureSource } from './TextureSource.ts';
import type { VoxelGridTextureSourceKind } from './TextureSourceKind.ts';

// CPU source for a 3D voxel lattice. Bitmap remains the bytes-guaranteed two-dimensional pixel API;
// voxel grids carry their own depth, byte layout, and revision counter.
export interface VoxelGrid extends TextureSource {
  data: Uint8Array<ArrayBuffer>;
  depth: number;
  format: PixelFormat;
  readonly kind: typeof VoxelGridTextureSourceKind;
}
