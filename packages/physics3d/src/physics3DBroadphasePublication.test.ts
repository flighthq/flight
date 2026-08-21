import { createBvhSpatialBackend3D, setSpatialIndexingGuard } from '@flighthq/spatial/contract';
import type { SpatialAabb3D, SpatialIndexingNotice } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getPhysics3DBroadphaseBodyIndices,
  publishPhysics3DBroadphaseBody,
  withdrawPhysics3DBroadphaseBody,
} from './physics3DBroadphasePublication';
import { createPhysics3DWorld } from './world';

afterEach(() => {
  setSpatialIndexingGuard(null);
});

describe('getPhysics3DBroadphaseBodyIndices', () => {
  it('retains publication state for one backend and rebuilds it when the backend changes', () => {
    const world = createPhysics3DWorld();
    const first = getPhysics3DBroadphaseBodyIndices(world);
    first.add(7);
    expect(getPhysics3DBroadphaseBodyIndices(world)).toBe(first);

    world.index = createBvhSpatialBackend3D();

    const replaced = getPhysics3DBroadphaseBodyIndices(world);
    expect(replaced).not.toBe(first);
    expect(replaced.size).toBe(0);
  });
});

describe('publishPhysics3DBroadphaseBody', () => {
  it('inserts once and then updates without reporting a missing-id lifecycle fault', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const world = createPhysics3DWorld();

    publishPhysics3DBroadphaseBody(world, 7, box(0));
    publishPhysics3DBroadphaseBody(world, 7, box(1));

    expect(world.index.explainSpatialIndexing(7).mode).toBe('cells');
    expect(notices.filter((notice) => notice.reason === 'missing-id')).toEqual([]);
  });
});

describe('withdrawPhysics3DBroadphaseBody', () => {
  it('removes a publication once and leaves a never-published id alone', () => {
    const notices: SpatialIndexingNotice[] = [];
    setSpatialIndexingGuard((notice) => notices.push({ ...notice }));
    const world = createPhysics3DWorld();

    withdrawPhysics3DBroadphaseBody(world, 8);
    publishPhysics3DBroadphaseBody(world, 7, box(0));
    withdrawPhysics3DBroadphaseBody(world, 7);
    withdrawPhysics3DBroadphaseBody(world, 7);

    expect(world.index.explainSpatialIndexing(7).mode).toBe('absent');
    expect(notices.filter((notice) => notice.reason === 'missing-id')).toEqual([]);
  });
});

function box(offset: number): SpatialAabb3D {
  return { minX: offset, minY: 0, minZ: 0, maxX: offset + 1, maxY: 1, maxZ: 1 };
}
