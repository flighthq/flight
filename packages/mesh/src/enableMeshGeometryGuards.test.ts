import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry, MeshGeometry } from '@flighthq/types/contract';

import { createMeshGeometryFromAttributes, wrapMeshGeometryUvs } from './contract';
import {
  areMeshGeometryGuardsEnabled,
  disableMeshGeometryGuards,
  enableMeshGeometryGuards,
} from './enableMeshGeometryGuards';

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

// One triangle whose corners carry the given uv0 coordinates.
function triangle(uvs: readonly number[]): MeshGeometry {
  return createMeshGeometryFromAttributes({
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    uvs,
  });
}

afterEach(() => {
  disableMeshGeometryGuards();
});

describe('areMeshGeometryGuardsEnabled', () => {
  it('reports the current module guard state', () => {
    expect(areMeshGeometryGuardsEnabled()).toBe(false);
    enableMeshGeometryGuards();
    expect(areMeshGeometryGuardsEnabled()).toBe(true);
    disableMeshGeometryGuards();
    expect(areMeshGeometryGuardsEnabled()).toBe(false);
  });
});

// These two describes cross-validate, and the order is load-bearing. `logOnce` keys are process-wide with
// no reset, so this file can observe the warning fire exactly once. If `disableMeshGeometryGuards` were a
// no-op, the wrap below would fire and spend the key, and the `enableMeshGeometryGuards` test that runs
// after it would then see nothing and fail. That is what stops the zero-entry assertion here from being
// the vacuous pass it would otherwise be.
describe('disableMeshGeometryGuards', () => {
  it('uninstalls the guard', () => {
    enableMeshGeometryGuards();
    disableMeshGeometryGuards();

    const entries = captureLog(() => wrapMeshGeometryUvs(triangle([0.9, 0.5, 1.1, 0.5, 0.9, 0.6])));

    expect(entries).toHaveLength(0);
  });
});

describe('enableMeshGeometryGuards', () => {
  // Both halves matter and the silent one matters more: a guard that fires on the operation's own use
  // case is noise a caller learns to ignore. The quiet geometry lies wholly inside tile 1 — entirely
  // outside [0, 1), which is exactly the input wrapping exists for — and must produce nothing.
  //
  // Idempotence has no assertion of its own here because it cannot have one: a second enable installs
  // over the same slot, and `logOnce` would collapse a doubled warning anyway. `setMeshGeometryUvWrapGuard`
  // replacing rather than accumulating is pinned in meshGeometryGuards.test.ts, which is where it is
  // observable.
  it('stays silent for a fold that shifts a primitive uniformly, then warns once for one that tears it', () => {
    enableMeshGeometryGuards();
    enableMeshGeometryGuards();

    const quiet = captureLog(() => wrapMeshGeometryUvs(triangle([1.2, 1.2, 1.8, 1.2, 1.2, 1.8])));
    expect(quiet).toHaveLength(0);

    const entries = captureLog(() => {
      wrapMeshGeometryUvs(triangle([0.9, 0.5, 1.1, 0.5, 0.9, 0.6]));
      wrapMeshGeometryUvs(triangle([0.5, 0.9, 0.5, 1.1, 0.6, 0.9]));
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('mesh');
    // The axis is data rather than prose, so a caller can branch on it and the message stays stable.
    expect(entries[0].data).toMatchObject({ primitiveCount: 1, tearsU: true, tearsV: false, tornPrimitiveCount: 1 });
    const message = String((entries[0].data as Record<string, unknown>).message);
    expect(message).toContain('wrapMeshGeometryUvs');
    expect(message).toContain('1 of 1 primitives');
    expect(message).toContain('explainMeshGeometryUvWrap');
    expect(message).toContain('createTilingSampler');
  });
});
