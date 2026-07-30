import type { VoxelGrid } from '@flighthq/types/contract';

// Marks direct VoxelGrid.data writes visible to every Texture that samples this shared source.
export function invalidateVoxelGrid(voxelGrid: VoxelGrid): void {
  voxelGrid.version = (voxelGrid.version + 1) >>> 0;
}
