import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { CollisionShape2D, LogEntry } from '@flighthq/types/contract';

import { areCollisionGuardsEnabled, disableCollisionGuards, enableCollisionGuards } from './enableCollisionGuards';
import { createCollisionManifold2D } from './manifold';
import { createCollisionManifold3D } from './manifold3D';
import { testCollision2D } from './testCollision2D';
import { testCollision3D } from './testCollision3D';

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

afterEach(() => {
  disableCollisionGuards();
});

describe('areCollisionGuardsEnabled', () => {
  it('reports the current module guard state', () => {
    expect(areCollisionGuardsEnabled()).toBe(false);
    enableCollisionGuards();
    expect(areCollisionGuardsEnabled()).toBe(true);
  });
});

describe('disableCollisionGuards', () => {
  it('uninstalls the guard', () => {
    enableCollisionGuards();
    disableCollisionGuards();
    const entries = captureLog(() => {
      testCollision2D(
        { kind: 'circle', radius: 0, x: 0, y: 0 },
        { kind: 'circle', radius: 1, x: 0, y: 0 },
        createCollisionManifold2D(),
      );
    });
    expect(entries).toHaveLength(0);
  });
});

describe('enableCollisionGuards', () => {
  it('stays silent for a supported pair, and warns once for a degenerate shape', () => {
    enableCollisionGuards();
    const out = createCollisionManifold2D();
    const valid: CollisionShape2D = { kind: 'circle', radius: 1, x: 0, y: 0 };
    const entries = captureLog(() => {
      testCollision2D(valid, { kind: 'circle', radius: 1, x: 4, y: 0 }, out);
      testCollision2D({ kind: 'circle', radius: 0, x: 0, y: 0 }, valid, out);
      testCollision2D({ kind: 'circle', radius: 0, x: 0, y: 0 }, valid, out);
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('collision');
    expect(entries[0].data).toMatchObject({ kind: 'circle', shapeIndex: 0, status: 'degenerate-shape' });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('explainCollisionTest2D');
  });

  it('warns for an area-less kind the manifold path cannot answer', () => {
    enableCollisionGuards();
    const entries = captureLog(() => {
      testCollision2D(
        { kind: 'point', x: 0, y: 0 },
        { kind: 'circle', radius: 1, x: 0, y: 0 },
        createCollisionManifold2D(),
      );
    });

    // The point is INSIDE the circle, and the manifold path reports them as not overlapping. That
    // silent false used to be the one refusal the guard stayed quiet about, and it is the worst
    // sentinel available: indistinguishable from two shapes genuinely not touching.
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ kind: 'point', shapeIndex: 0, status: 'unsupported-shape-kind' });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('area-less');
  });

  it('warns for a vendor kind nothing has registered', () => {
    enableCollisionGuards();
    const entries = captureLog(() => {
      testCollision2D(
        { kind: 'circle', radius: 1, x: 0, y: 0 },
        // Cast through `unknown` because `CollisionShape2D` is still a CLOSED tagged union while
        // `CollisionShapeKind2D` is open — the mismatch the collision charter's open direction 2
        // names. A vendor kind is not constructible without this, which is the compile-time half of
        // the same lie the guard arm above fixes at runtime.
        { kind: 'acme.capsule' } as unknown as CollisionShape2D,
        createCollisionManifold2D(),
      );
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ kind: 'acme.capsule', shapeIndex: 1, status: 'unsupported-shape-kind' });
  });

  it('warns for a non-convex polygon and identifies its argument index', () => {
    enableCollisionGuards();
    const entries = captureLog(() => {
      testCollision2D(
        { kind: 'circle', radius: 1, x: 0, y: 0 },
        { kind: 'polygon', points: [0, 0, 2, 0, 1, 1, 2, 2, 0, 2] },
        createCollisionManifold2D(),
      );
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({
      kind: 'polygon',
      shapeIndex: 1,
      status: 'non-convex-polygon',
    });
  });

  it('guards the 3D dispatcher from the same switch, naming the registrar', () => {
    // One verb covers both dimensions. A caller who asked for warnings and got them for only half the
    // package would have no way to notice the other half was silent.
    //
    // A VENDOR kind rather than an unregistered sphere, deliberately. The support registry is
    // process-global mutable state shared by every test file in a worker, so whether the built-in
    // supports are registered here depends on which other files have run — a built-in shape is not a
    // reliable stand-in for "nothing is registered". A dotted kind nothing ever registers reaches the
    // same arm deterministically.
    enableCollisionGuards();
    const entries = captureLog(() => {
      testCollision3D(
        { kind: 'acme.unregistered' },
        { kind: 'sphere', radius: 2, x: 1, y: 0, z: 0 },
        createCollisionManifold3D(),
      );
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('collision');
    expect(entries[0].data).toMatchObject({
      kind: 'acme.unregistered',
      shapeIndex: 0,
      status: 'unsupported-shape-kind',
    });

    // The message names the REPAIR, not just the fault. An unregistered 3D kind is physics3d's sharpest
    // usability edge — a world detects nothing and its bodies fall through its floors in silence — and
    // the overwhelmingly likely cause is that the registrar was never called.
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain(
      'registerBuiltInCollisionSupports3D',
    );
  });

  it('warns for a degenerate 3D shape and points at the 3D explain seam', () => {
    enableCollisionGuards();
    const entries = captureLog(() => {
      testCollision3D(
        { kind: 'capsule', radius: 0, x0: 0, x1: 1, y0: 0, y1: 0, z0: 0, z1: 0 },
        { kind: 'sphere', radius: 1, x: 0, y: 0, z: 0 },
        createCollisionManifold3D(),
      );
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ kind: 'capsule', shapeIndex: 0, status: 'degenerate-shape' });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('explainCollisionTest3D');
  });

  it('does not let one dimension suppress the other dimension first warning', () => {
    // logOnce dedupes by key, so the dimension has to be IN the key. Without it, a 2D degenerate-shape
    // warning would silence the first 3D one for a caller running both worlds — the guard going quiet
    // about a real fault because an unrelated one was already reported.
    enableCollisionGuards();
    const entries = captureLog(() => {
      testCollision2D(
        { kind: 'aabb', maxX: 0, maxY: 0, minX: 0, minY: 0 },
        { kind: 'circle', radius: 1, x: 0, y: 0 },
        createCollisionManifold2D(),
      );
      testCollision3D(
        { kind: 'aabb', maxX: 0, maxY: 0, maxZ: 0, minX: 0, minY: 0, minZ: 0 },
        { kind: 'sphere', radius: 1, x: 0, y: 0, z: 0 },
        createCollisionManifold3D(),
      );
    });

    // Same kind string, same status, same shape index — everything but the dimension.
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => (entry.data as Record<string, unknown>).status)).toEqual([
      'degenerate-shape',
      'degenerate-shape',
    ]);
  });
});
