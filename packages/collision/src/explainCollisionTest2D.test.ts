import type { CollisionShape2D } from '@flighthq/types/contract';

import { explainCollisionTest2D } from './explainCollisionTest2D';
import { registerBuiltInCollisionPairTests2D } from './registerBuiltInCollisionPairTests2D';

registerBuiltInCollisionPairTests2D();

describe('explainCollisionTest2D', () => {
  it('names an unregistered kind rather than calling the pair separated', async () => {
    // A fresh module registry, so the two collision registries are genuinely empty — the state a caller
    // who forgot to register is in. Reached this way rather than by ordering this test before the
    // registrar above, so it cannot be silently broken by moving tests around.
    vi.resetModules();
    const { explainCollisionTest2D: explainUnregistered } = await import('./explainCollisionTest2D');

    // A circle is a valid circle whether or not anything is registered for it, so shape validation passes
    // and the dispatcher returns its silent false. Reporting `separated` for two clearly overlapping
    // circles would be the seam repeating the dispatcher's silence instead of explaining it.
    expect(
      explainUnregistered({ kind: 'circle', radius: 2, x: 0, y: 0 }, { kind: 'circle', radius: 2, x: 1, y: 0 }),
    ).toMatchObject({
      kind: 'circle',
      overlapping: false,
      shapeIndex: 0,
      status: 'unsupported-shape-kind',
    });
  });

  it('distinguishes overlap from ordinary separation', () => {
    const circle: CollisionShape2D = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(explainCollisionTest2D(circle, { kind: 'circle', radius: 2, x: 1, y: 0 })).toMatchObject({
      kind: null,
      overlapping: true,
      shapeIndex: null,
      status: 'overlapping',
    });
    expect(explainCollisionTest2D(circle, { kind: 'circle', radius: 2, x: 10, y: 0 })).toMatchObject({
      kind: null,
      overlapping: false,
      shapeIndex: null,
      status: 'separated',
    });
  });

  it('identifies which input is degenerate or non-convex', () => {
    const circle: CollisionShape2D = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(explainCollisionTest2D(circle, { kind: 'circle', radius: 0, x: 0, y: 0 })).toMatchObject({
      kind: 'circle',
      overlapping: false,
      shapeIndex: 1,
      status: 'degenerate-shape',
    });
    expect(explainCollisionTest2D({ kind: 'polygon', points: [0, 0, 2, 0, 1, 1, 2, 2, 0, 2] }, circle)).toMatchObject({
      kind: 'polygon',
      overlapping: false,
      shapeIndex: 0,
      status: 'non-convex-polygon',
    });
  });

  it('explains the silent false sentinel for area-less and unknown kinds', () => {
    const circle: CollisionShape2D = { kind: 'circle', radius: 2, x: 0, y: 0 };
    expect(explainCollisionTest2D({ kind: 'point', x: 0, y: 0 }, circle)).toMatchObject({
      kind: 'point',
      shapeIndex: 0,
      status: 'unsupported-shape-kind',
    });
    const custom = { kind: 'acme.capsule' } as unknown as CollisionShape2D;
    expect(explainCollisionTest2D(circle, custom)).toMatchObject({
      kind: 'acme.capsule',
      shapeIndex: 1,
      status: 'unsupported-shape-kind',
    });
  });
});
