import type { CollisionBuiltInShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  collideCapsuleAabbContactManifold2D,
  collideCapsuleCapsuleContactManifold2D,
  collideCapsuleObbContactManifold2D,
  collideCapsulePolygonContactManifold2D,
  collideCircleCapsuleContactManifold2D,
} from './capsuleContact2D';
import { collideContactManifold2D } from './collideContactManifold2D';
import { createCollisionContactManifold2D } from './contactManifold2D';
import { getCollisionShapeContainsPoint2D } from './pointContainment2D';

function manifold() {
  return createCollisionContactManifold2D();
}

function shiftShape(shape: CollisionBuiltInShape2D, dx: number, dy: number): CollisionBuiltInShape2D {
  switch (shape.kind) {
    case 'capsule':
      return { ...shape, x0: shape.x0 + dx, y0: shape.y0 + dy, x1: shape.x1 + dx, y1: shape.y1 + dy };
    case 'circle':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'aabb':
      return { ...shape, minX: shape.minX + dx, maxX: shape.maxX + dx, minY: shape.minY + dy, maxY: shape.maxY + dy };
    case 'obb':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'polygon':
      return { ...shape, points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    default:
      return shape;
  }
}

// Grid sampling of the two containment predicates. A crude instrument, and deliberately so: it shares
// no algebra at all with the separating-axis search it is checking.
function sampledOverlap(a: CollisionBuiltInShape2D, b: CollisionBuiltInShape2D): boolean {
  const N = 90;
  for (let ix = 0; ix <= N; ix++) {
    for (let iy = 0; iy <= N; iy++) {
      const x = -8 + (16 * ix) / N;
      const y = -8 + (16 * iy) / N;
      if (getCollisionShapeContainsPoint2D(a, x, y) && getCollisionShapeContainsPoint2D(b, x, y)) return true;
    }
  }
  return false;
}

function distanceToCapsuleAxis(capsule: Extract<CollisionBuiltInShape2D, { kind: 'capsule' }>, x: number, y: number) {
  const dx = capsule.x1 - capsule.x0;
  const dy = capsule.y1 - capsule.y0;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((x - capsule.x0) * dx + (y - capsule.y0) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return Math.hypot(x - (capsule.x0 + t * dx), y - (capsule.y0 + t * dy));
}

describe('collideCapsuleAabbContactManifold2D', () => {
  it('gives a horizontal capsule resting on a floor two points, one under each end of its body', () => {
    // THE case the whole two-point path exists for. One point would let the capsule pivot about it and
    // rock forever on a flat floor, which is what a player would see rather than a number in a log.
    const out = manifold();
    const overlapping = collideCapsuleAabbContactManifold2D(
      { x0: -1, y0: 0.49, x1: 1, y1: 0.49, radius: 0.5 },
      { minX: -10, minY: -1, maxX: 10, maxY: 0 },
      out,
    );

    expect(overlapping).toBe(true);
    expect(out.pointCount).toBe(2);
    expect(out.normalX).toBeCloseTo(0, 12);
    expect(out.normalY).toBeCloseTo(1, 12);
    expect(out.depth).toBeCloseTo(0.01, 12);
    expect([out.points[0].x, out.points[1].x].sort((a, b) => a - b)).toEqual([-1, 1]);
    // On the capsule's underside, not on its axis.
    expect(out.points[0].y).toBeCloseTo(-0.01, 12);
  });

  it('gives an END-ON capsule a single point, not a fabricated span', () => {
    // A capsule standing upright on a floor touches at one place. Projecting its axis onto the floor and
    // clipping still yields a span, and the two points that span produces are placed by stepping the
    // radius along a normal nearly parallel to the axis — landing them inside the capsule.
    const out = manifold();
    collideCapsuleAabbContactManifold2D(
      { x0: 0, y0: 0.49, x1: 0, y1: 2.49, radius: 0.5 },
      { minX: -10, minY: -1, maxX: 10, maxY: 0 },
      out,
    );

    expect(out.pointCount).toBe(1);
    expect(out.normalY).toBeCloseTo(1, 12);
    expect(
      distanceToCapsuleAxis(
        { kind: 'capsule', x0: 0, y0: 0.49, x1: 0, y1: 2.49, radius: 0.5 },
        out.points[0].x,
        out.points[0].y,
      ),
    ).toBeCloseTo(0.5, 12);
  });

  it('reports no contact for a capsule clear of the box, touching exclusive', () => {
    const out = manifold();
    expect(
      collideCapsuleAabbContactManifold2D(
        { x0: -1, y0: 0.5, x1: 1, y1: 0.5, radius: 0.5 },
        { minX: -10, minY: -1, maxX: 10, maxY: 0 },
        out,
      ),
    ).toBe(false);
    expect(out.overlapping).toBe(false);
  });
});

describe('collideCapsuleCapsuleContactManifold2D', () => {
  it('gives two parallel capsules lying side by side a two-point span', () => {
    const out = manifold();
    const overlapping = collideCapsuleCapsuleContactManifold2D(
      { x0: -1, y0: 0.9, x1: 1, y1: 0.9, radius: 0.5 },
      { x0: -2, y0: 0, x1: 2, y1: 0, radius: 0.5 },
      out,
    );

    expect(overlapping).toBe(true);
    expect(out.pointCount).toBe(2);
    expect(out.normalY).toBeCloseTo(1, 9);
    expect(out.depth).toBeCloseTo(0.1, 9);
  });

  it('separates two capsules whose AXES CROSS, which is not a near-touching pair', () => {
    // The reduction this pair cannot use. Two capsules in an X have axes at distance zero, and reading
    // that as "the surfaces just barely reach" reports a depth of rA + rB along an arbitrary
    // perpendicular — which does not separate them, because clearing a crossed pair means moving far
    // enough for the SEGMENTS to clear, a distance set by their lengths rather than their radii.
    const a: CollisionBuiltInShape2D = { kind: 'capsule', x0: 0, y0: -2, x1: 0, y1: 2, radius: 0.4 };
    const b: CollisionBuiltInShape2D = { kind: 'capsule', x0: -2, y0: 0, x1: 2, y1: 0, radius: 0.3 };
    const out = manifold();

    expect(collideCapsuleCapsuleContactManifold2D(a, b, out)).toBe(true);
    // Pushing by the reported translation must actually clear them.
    expect(sampledOverlap(shiftShape(a, out.normalX * out.depth * 1.02, out.normalY * out.depth * 1.02), b)).toBe(
      false,
    );
    // And the depth is far larger than the sum of radii, which the distance reduction would have reported.
    expect(out.depth).toBeGreaterThan(0.7);
  });

  it('places a single contact point on A surface even when the normal is not perpendicular to its axis', () => {
    // Two capsules meeting end to end. The closest point between the axes is not where the contact is,
    // and offsetting from it along a normal that is nearly parallel to the axis lands inside the shape.
    const a = { x0: 0, y0: 0, x1: 3, y1: 0, radius: 0.5 } as const;
    const out = manifold();
    collideCapsuleCapsuleContactManifold2D(a, { x0: 3.8, y0: 0, x1: 6, y1: 0, radius: 0.4 }, out);

    expect(out.pointCount).toBe(1);
    expect(distanceToCapsuleAxis({ kind: 'capsule', ...a }, out.points[0].x, out.points[0].y)).toBeCloseTo(0.5, 12);
  });

  it('reports no contact for capsules further apart than the sum of their radii', () => {
    const out = manifold();
    expect(
      collideCapsuleCapsuleContactManifold2D(
        { x0: -1, y0: 0, x1: 1, y1: 0, radius: 0.5 },
        { x0: -1, y0: 1.0, x1: 1, y1: 1.0, radius: 0.5 },
        out,
      ),
    ).toBe(false);
  });
});

describe('collideCapsuleObbContactManifold2D', () => {
  it('rests a capsule flat on a rotated box face with two points', () => {
    const out = manifold();
    // The box is turned a quarter turn, so its 0.6 half-extent faces up and its face runs along x.
    const overlapping = collideCapsuleObbContactManifold2D(
      { x0: -0.5, y0: 1.49, x1: 0.5, y1: 1.49, radius: 0.5 },
      { x: 0, y: 0, halfW: 2, halfH: 1, rotation: 0 },
      out,
    );

    expect(overlapping).toBe(true);
    expect(out.pointCount).toBe(2);
    expect(out.normalY).toBeCloseTo(1, 9);
  });

  it('finds a corner contact along the corner, not along whichever face is least wrong', () => {
    // The candidate axis that only a VERTEX supplies. A rounded end pressed into a corner has its
    // deepest direction radial from that corner, matching no face normal of either shape.
    const box = { x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0 } as const;
    const capsule: CollisionBuiltInShape2D = { kind: 'capsule', x0: 1.3, y0: 1.3, x1: 3, y1: 3, radius: 0.5 };
    const out = manifold();

    expect(collideCapsuleObbContactManifold2D(capsule, box, out)).toBe(true);
    // Radial from the corner (1,1), so both components are equal and positive.
    expect(out.normalX).toBeCloseTo(Math.SQRT1_2, 6);
    expect(out.normalY).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe('collideCapsulePolygonContactManifold2D', () => {
  it('rests a capsule on a polygon face with two points, whatever the winding', () => {
    const clockwise = { points: [-5, 0, 5, 0, 5, -2, -5, -2] };
    const counterClockwise = { points: [-5, -2, 5, -2, 5, 0, -5, 0] };
    for (const polygon of [clockwise, counterClockwise]) {
      const out = manifold();
      expect(
        collideCapsulePolygonContactManifold2D({ x0: -1, y0: 0.49, x1: 1, y1: 0.49, radius: 0.5 }, polygon, out),
      ).toBe(true);
      expect(out.pointCount).toBe(2);
      expect(out.normalY).toBeCloseTo(1, 9);
    }
  });

  it('declines a degenerate polygon rather than poisoning the manifold', () => {
    const out = manifold();
    expect(
      collideCapsulePolygonContactManifold2D(
        { x0: 0, y0: 0, x1: 1, y1: 0, radius: 0.5 },
        { points: [0, 0, 1, 0] },
        out,
      ),
    ).toBe(false);
  });
});

describe('collideCircleCapsuleContactManifold2D', () => {
  it('reduces to circle-versus-circle at the capsule closest axis point', () => {
    const out = manifold();
    const overlapping = collideCircleCapsuleContactManifold2D(
      { x: 0, y: 0.9, radius: 0.5 },
      { x0: -2, y0: 0, x1: 2, y1: 0, radius: 0.5 },
      out,
    );

    expect(overlapping).toBe(true);
    expect(out.pointCount).toBe(1);
    expect(out.normalY).toBeCloseTo(1, 12);
    expect(out.depth).toBeCloseTo(0.1, 12);
    // On the CIRCLE surface: the circle is the lower-ranked shape and owns the points.
    expect(out.points[0].y).toBeCloseTo(0.4, 12);
  });

  it('pushes a circle centred on the capsule axis out sideways rather than nowhere', () => {
    const out = manifold();
    expect(
      collideCircleCapsuleContactManifold2D(
        { x: 0, y: 0, radius: 0.2 },
        { x0: -2, y0: 0, x1: 2, y1: 0, radius: 0.5 },
        out,
      ),
    ).toBe(true);
    // The axis runs along x, so the way out is perpendicular to it and the normal has no x component.
    expect(out.normalX).toBeCloseTo(0, 12);
    expect(Math.abs(out.normalY)).toBeCloseTo(1, 12);
  });

  it('reports no contact when the circle clears the capsule', () => {
    const out = manifold();
    expect(
      collideCircleCapsuleContactManifold2D(
        { x: 0, y: 1.1, radius: 0.5 },
        { x0: -2, y0: 0, x1: 2, y1: 0, radius: 0.5 },
        out,
      ),
    ).toBe(false);
  });
});
