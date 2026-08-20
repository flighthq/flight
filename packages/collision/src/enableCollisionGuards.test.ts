import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { CollisionShape2D, LogEntry } from '@flighthq/types/contract';

import { areCollisionGuardsEnabled, disableCollisionGuards, enableCollisionGuards } from './enableCollisionGuards';
import { createCollisionManifold2D } from './manifold';
import { testCollision2D } from './testCollision2D';

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
});
