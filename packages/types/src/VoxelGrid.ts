import type { PixelFormat } from './PixelFormat';
import type { TextureSource } from './TextureSource';
import type { VoxelGridTextureSourceKind } from './TextureSourceKind';

// CPU source for a 3D voxel lattice. Bitmap remains the bytes-guaranteed two-dimensional pixel API;
// voxel grids carry their own depth, byte layout, and revision counter.
export interface VoxelGrid extends TextureSource {
  data: Uint8Array<ArrayBuffer>;
  depth: number;
  format: PixelFormat;
  readonly kind: typeof VoxelGridTextureSourceKind;
}
