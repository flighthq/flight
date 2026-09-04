import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { VoxelGrid } from '@flighthq/types/contract';
import { VoxelGridTextureSourceKind } from '@flighthq/types/contract';

import { invalidateVoxelGrid } from './voxelGrid';

function voxelGrid(version: number): VoxelGrid {
    const out = allocateEntity<VoxelGrid>();
  out.data = new Uint8Array(32);
  out.depth = 2;
  out.format = 'rgba8unorm' as const;
  out.height = 2;
  out.kind = VoxelGridTextureSourceKind;
  out.version = version;
  out.width = 2;
  return finishEntity(out) as VoxelGrid;;
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
