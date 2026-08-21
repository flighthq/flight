import type { Physics3DWorld } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { reportPhysics3DSpatialIndexing, setPhysics3DSpatialIndexingGuard } from './physics3DSpatialIndexingGuards';
import { createPhysics3DWorld } from './world';

afterEach(() => {
  setPhysics3DSpatialIndexingGuard(null);
});

describe('reportPhysics3DSpatialIndexing', () => {
  it('reports the world only while the optional seam is installed', () => {
    const world = createPhysics3DWorld();
    const received: Readonly<Physics3DWorld>[] = [];

    reportPhysics3DSpatialIndexing(world);
    setPhysics3DSpatialIndexingGuard((reported) => received.push(reported));
    reportPhysics3DSpatialIndexing(world);
    setPhysics3DSpatialIndexingGuard(null);
    reportPhysics3DSpatialIndexing(world);

    expect(received).toEqual([world]);
  });
});

describe('setPhysics3DSpatialIndexingGuard', () => {
  it('replaces the previous guard instead of accumulating callbacks', () => {
    const world = createPhysics3DWorld();
    let firstCalls = 0;
    let secondCalls = 0;
    setPhysics3DSpatialIndexingGuard(() => {
      firstCalls += 1;
    });
    setPhysics3DSpatialIndexingGuard(() => {
      secondCalls += 1;
    });

    reportPhysics3DSpatialIndexing(world);

    expect(firstCalls).toBe(0);
    expect(secondCalls).toBe(1);
  });
});
