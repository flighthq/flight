import type { CollisionShape2D } from '@flighthq/types/contract';

import {
  getCollisionPolygonValidationStatus2D,
  getCollisionShapeValidationStatus2D,
} from './collisionShapeValidation2D';

describe('getCollisionPolygonValidationStatus2D', () => {
  it('distinguishes valid, degenerate, and non-convex polygons', () => {
    expect(getCollisionPolygonValidationStatus2D([0, 0, 2, 0, 2, 2, 0, 2])).toBeNull();
    expect(getCollisionPolygonValidationStatus2D([0, 0, 1, 1])).toBe('degenerate-shape');
    expect(getCollisionPolygonValidationStatus2D([0, 0, 1, 0, 2, 0])).toBe('degenerate-shape');
    expect(getCollisionPolygonValidationStatus2D([0, 0, 2, 0, 1, 1, 2, 2, 0, 2])).toBe('non-convex-polygon');
  });
});

describe('getCollisionShapeValidationStatus2D', () => {
  it('rejects every degenerate manifold shape', () => {
    const shapes: CollisionShape2D[] = [
      { kind: 'circle', x: 0, y: 0, radius: 0 },
      { kind: 'aabb', minX: 1, minY: 0, maxX: 1, maxY: 2 },
      { kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 0, rotation: 0 },
      { kind: 'polygon', points: [0, 0, 1, 1] },
      { kind: 'segment', x0: 1, y0: 1, x1: 1, y1: 1 },
    ];
    for (const shape of shapes) expect(getCollisionShapeValidationStatus2D(shape)).toBe('degenerate-shape');
  });

  it('reports area-less and unknown kinds as unsupported', () => {
    expect(getCollisionShapeValidationStatus2D({ kind: 'point', x: 0, y: 0 })).toBe('unsupported-shape-kind');
    expect(getCollisionShapeValidationStatus2D({ kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 1 })).toBe(
      'unsupported-shape-kind',
    );
    expect(getCollisionShapeValidationStatus2D({ kind: 'acme.capsule' } as unknown as CollisionShape2D)).toBe(
      'unsupported-shape-kind',
    );
  });
});
