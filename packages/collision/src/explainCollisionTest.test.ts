import type { CollisionShape } from '@flighthq/types/contract';

import { explainCollisionTest } from './explainCollisionTest';

describe('explainCollisionTest', () => {
  it('distinguishes overlap from ordinary separation', () => {
    const circle: CollisionShape = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(explainCollisionTest(circle, { kind: 'circle', radius: 2, x: 1, y: 0 })).toEqual({
      kind: null,
      overlapping: true,
      shapeIndex: null,
      status: 'overlapping',
    });
    expect(explainCollisionTest(circle, { kind: 'circle', radius: 2, x: 10, y: 0 })).toEqual({
      kind: null,
      overlapping: false,
      shapeIndex: null,
      status: 'separated',
    });
  });

  it('identifies which input is degenerate or non-convex', () => {
    const circle: CollisionShape = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(explainCollisionTest(circle, { kind: 'circle', radius: 0, x: 0, y: 0 })).toEqual({
      kind: 'circle',
      overlapping: false,
      shapeIndex: 1,
      status: 'degenerate-shape',
    });
    expect(explainCollisionTest({ kind: 'polygon', points: [0, 0, 2, 0, 1, 1, 2, 2, 0, 2] }, circle)).toEqual({
      kind: 'polygon',
      overlapping: false,
      shapeIndex: 0,
      status: 'non-convex-polygon',
    });
  });

  it('explains the silent false sentinel for area-less and unknown kinds', () => {
    const circle: CollisionShape = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(explainCollisionTest({ kind: 'point', x: 0, y: 0 }, circle)).toMatchObject({
      kind: 'point',
      shapeIndex: 0,
      status: 'unsupported-shape-kind',
    });
    const custom = { kind: 'acme.capsule' } as unknown as CollisionShape;
    expect(explainCollisionTest(circle, custom)).toMatchObject({
      kind: 'acme.capsule',
      shapeIndex: 1,
      status: 'unsupported-shape-kind',
    });
  });
});
