import { createEntity } from '@flighthq/entity/contract';
import type { VoxelGrid } from '@flighthq/types/contract';
import { VoxelGridTextureSourceKind } from '@flighthq/types/contract';

import { invalidateVoxelGrid } from './voxelGrid';

function voxelGrid(version: number): VoxelGrid {
  return createEntity({
    data: new Uint8Array(32),
    depth: 2,
    format: 'rgba8unorm' as const,
    height: 2,
    kind: VoxelGridTextureSourceKind,
    version,
    width: 2,
  }) as VoxelGrid;
}

describe('invalidateVoxelGrid', () => {
  it('advances the shared content version without replacing voxel bytes', () => {
    const grid = voxelGrid(0);
    const data = grid.data;

    invalidateVoxelGrid(grid);

    expect(grid.version).toBe(1);
    expect(grid.data).toBe(data);
  });

  it('wraps the content version as u32', () => {
    const grid = voxelGrid(0xffffffff);

    invalidateVoxelGrid(grid);

    expect(grid.version).toBe(0);
  });
});
