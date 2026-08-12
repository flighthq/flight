import { describe, expect, it } from 'vitest';

import { createCollisionTimeOfImpact, sweepCollisionShape } from './sweepCollisionShape';

describe('createCollisionTimeOfImpact', () => {
  it('creates a cleared reusable output record', () => {
    expect(createCollisionTimeOfImpact()).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });
});

describe('sweepCollisionShape', () => {
  it('keeps continuous-SAT state isolated from a nested sweep triggered by the output setter', () => {
    const out = createCollisionTimeOfImpact();
    let fraction = 0;
    let fractionWrites = 0;
    let nestedCalls = 0;
    Object.defineProperty(out, 'fraction', {
      configurable: true,
      enumerable: true,
      get: () => fraction,
      set(value: number) {
        fraction = value;
        fractionWrites++;
        if (fractionWrites !== 2) return;
        nestedCalls++;
        sweepCollisionShape(
          { kind: 'aabb', minX: -1, minY: 0, maxX: 1, maxY: 2 },
          0,
          10,
          { kind: 'aabb', minX: -1, minY: 5, maxX: 1, maxY: 7 },
          0,
          0,
          createCollisionTimeOfImpact(),
        );
      },
    });

    expect(
      sweepCollisionShape(
        { kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0 },
        10,
        0,
        { kind: 'aabb', minX: 5, minY: -1, maxX: 7, maxY: 1 },
        0,
        0,
        out,
      ),
    ).toBe(true);
    expect(nestedCalls).toBe(1);
    expect(out.fraction).toBeCloseTo(0.4);
    expect(out.normalX).toBe(-1);
    expect(out.normalY).toBe(0);
  });

  it('finds the exact circle-circle root under relative motion', () => {
    const out = createCollisionTimeOfImpact();
    expect(
      sweepCollisionShape(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        10,
        0,
        { kind: 'circle', x: 6, y: 0, radius: 1 },
        2,
        0,
        out,
      ),
    ).toBe(true);
    expect(out.fraction).toBeCloseTo(0.5);
    expect(out.normalX).toBe(-1);
    expect(out.x).toBeCloseTo(6);
  });

  it('sweeps a circle exactly against polygon faces and rounded corners', () => {
    const box = { kind: 'aabb', minX: 5, minY: 5, maxX: 7, maxY: 7 } as const;
    const face = createCollisionTimeOfImpact();
    expect(sweepCollisionShape({ kind: 'circle', x: 0, y: 6, radius: 1 }, 10, 0, box, 0, 0, face)).toBe(true);
    expect(face.fraction).toBeCloseTo(0.4);
    expect([face.normalX, face.normalY]).toEqual([-1, 0]);

    const corner = createCollisionTimeOfImpact();
    expect(sweepCollisionShape({ kind: 'circle', x: 0, y: 0, radius: 1 }, 10, 10, box, 0, 0, corner)).toBe(true);
    expect(corner.fraction).toBeCloseTo((5 - Math.SQRT1_2) / 10);
    expect(corner.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(corner.normalY).toBeCloseTo(-Math.SQRT1_2);
  });

  it('reverses the normal when the polygon is shape A and still writes a point on A', () => {
    const out = createCollisionTimeOfImpact();
    expect(
      sweepCollisionShape(
        { kind: 'aabb', minX: 5, minY: -1, maxX: 7, maxY: 1 },
        0,
        0,
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        10,
        0,
        out,
      ),
    ).toBe(true);
    expect(out.fraction).toBeCloseTo(0.4);
    expect(out.normalX).toBe(1);
    expect(out.x).toBe(5);
  });

  it('uses continuous SAT for polygon pairs and honours maxFraction', () => {
    const moving = { kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0 } as const;
    const fixed = { kind: 'aabb', minX: 5, minY: -1, maxX: 7, maxY: 1 } as const;
    const out = createCollisionTimeOfImpact();

    expect(sweepCollisionShape(moving, 10, 0, fixed, 0, 0, out, 0.3)).toBe(false);
    expect(out).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
    expect(sweepCollisionShape(moving, 10, 0, fixed, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(0.4);
    expect(out.normalX).toBe(-1);
    expect(out.x).toBeCloseTo(5);
  });

  it('reports an initial overlap at zero and ignores a touching pair moving apart', () => {
    const out = createCollisionTimeOfImpact();
    expect(
      sweepCollisionShape(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        1,
        0,
        { kind: 'circle', x: 1, y: 0, radius: 1 },
        0,
        0,
        out,
      ),
    ).toBe(true);
    expect(out.fraction).toBe(0);
    expect(out.normalX).toBe(-1);

    expect(
      sweepCollisionShape(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        -1,
        0,
        { kind: 'circle', x: 2, y: 0, radius: 1 },
        0,
        0,
        out,
      ),
    ).toBe(false);
  });

  it('fails closed and clears reused output for unsupported or invalid input', () => {
    const out = createCollisionTimeOfImpact();
    sweepCollisionShape(
      { kind: 'circle', x: 0, y: 0, radius: 1 },
      10,
      0,
      { kind: 'circle', x: 5, y: 0, radius: 1 },
      0,
      0,
      out,
    );
    expect(
      sweepCollisionShape({ kind: 'point', x: 0, y: 0 }, 1, 0, { kind: 'circle', x: 2, y: 0, radius: 1 }, 0, 0, out),
    ).toBe(false);
    expect(out).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
    expect(
      sweepCollisionShape(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        Number.NaN,
        0,
        { kind: 'circle', x: 2, y: 0, radius: 1 },
        0,
        0,
        out,
      ),
    ).toBe(false);
  });
});
