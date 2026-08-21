import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { explainCollisionTest3D } from './explainCollisionTest3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

function sphere(x: number, radius: number): CollisionShape3D {
  return { kind: 'sphere', radius, x, y: 0, z: 0 };
}

describe('explainCollisionTest3D', () => {
  it('names an unregistered kind rather than calling the pair separated', async () => {
    // The trap this seam exists for, and physics3d's sharpest usability edge: nothing registers at module
    // load, so a world that never called registerBuiltInCollisionSupports3D steps perfectly and detects
    // nothing. Reported as `separated`, that is indistinguishable from bodies genuinely not touching.
    //
    // A fresh module registry rather than test ordering, so this cannot be silently broken by moving
    // tests around.
    vi.resetModules();
    const { explainCollisionTest3D: explainUnregistered } = await import('./explainCollisionTest3D');

    expect(explainUnregistered(sphere(0, 2), sphere(1, 2))).toEqual({
      kind: 'sphere',
      overlapping: false,
      shapeIndex: 0,
      status: 'unsupported-shape-kind',
    });
  });

  it('distinguishes overlap from ordinary separation', () => {
    expect(explainCollisionTest3D(sphere(0, 2), sphere(1, 2))).toEqual({
      kind: null,
      overlapping: true,
      shapeIndex: null,
      status: 'overlapping',
    });
    expect(explainCollisionTest3D(sphere(0, 2), sphere(10, 2))).toEqual({
      kind: null,
      overlapping: false,
      shapeIndex: null,
      status: 'separated',
    });
  });

  it('reports the first invalid shape and which of the two it was', () => {
    expect(explainCollisionTest3D(sphere(0, 0), sphere(1, 2))).toEqual({
      kind: 'sphere',
      overlapping: false,
      shapeIndex: 0,
      status: 'degenerate-shape',
    });
    expect(explainCollisionTest3D(sphere(0, 2), sphere(1, -1))).toEqual({
      kind: 'sphere',
      overlapping: false,
      shapeIndex: 1,
      status: 'degenerate-shape',
    });
  });

  it('checks validity before registration, so a degenerate shape is not blamed on a missing support', async () => {
    vi.resetModules();
    const { explainCollisionTest3D: explainUnregistered } = await import('./explainCollisionTest3D');

    // Both faults are present at once. Validity is the more specific diagnosis and the one the caller can
    // act on directly, so it wins.
    expect(explainUnregistered(sphere(0, 0), sphere(1, 2)).status).toBe('degenerate-shape');
  });

  it('names an unrecognized vendor kind', () => {
    expect(explainCollisionTest3D({ kind: 'acme.cone' }, sphere(1, 2))).toEqual({
      kind: 'acme.cone',
      overlapping: false,
      shapeIndex: 0,
      status: 'unsupported-shape-kind',
    });
  });
});
