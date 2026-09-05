import { createAabb, createMatrix4 } from '@flighthq/geometry/contract';
import { computeMeshGeometryBounds, createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { InstancedMesh, Matrix4, MeshGeometry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  InstancedMeshKind,
  appendInstancedMeshInstance,
  clearInstancedMesh,
  cloneInstancedMesh,
  computeInstancedMeshLocalBoundsAabb,
  createInstancedMesh,
  createInstancedMeshSignals,
  enableInstancedMeshSignals,
  getInstancedMeshCapacity,
  getInstancedMeshInstanceColor,
  getInstancedMeshInstanceMatrix,
  getInstancedMeshSignals,
  initializeInstancedMeshSignals,
  invalidateInstancedMesh,
  isInstancedMesh,
  iterateInstancedMeshInstances,
  removeInstancedMeshInstance,
  reserveInstancedMesh,
  setInstancedMeshInstanceColor,
  setInstancedMeshInstanceCount,
  setInstancedMeshInstanceMatrix,
  setInstancedMeshInstanceMatrixRange,
} from './instancedMesh';

function translation(x: number, y = 0, z = 0): Matrix4 {
  const matrix = createMatrix4();
  matrix.m[12] = x;
  matrix.m[13] = y;
  matrix.m[14] = z;
  return matrix;
}

function boundedBox(): MeshGeometry {
  const geometry = createBoxMeshGeometry(2, 2, 2);
  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, geometry);
  geometry.bounds = bounds;
  return geometry;
}

function meshWith(...xs: number[]): InstancedMesh {
  const mesh = createInstancedMesh(boundedBox(), [null], 8);
  for (const x of xs) appendInstancedMeshInstance(mesh, translation(x));
  return mesh;
}

function translationXOf(mesh: Readonly<InstancedMesh>, index: number): number {
  const out = createMatrix4();
  getInstancedMeshInstanceMatrix(out, mesh, index);
  return out.m[12];
}

describe('appendInstancedMeshInstance', () => {
  it('grows the count and returns the index it wrote', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 8);

    expect(appendInstancedMeshInstance(mesh, translation(1))).toBe(0);
    expect(appendInstancedMeshInstance(mesh, translation(2))).toBe(1);
    expect(mesh.instanceCount).toBe(2);
    expect(translationXOf(mesh, 0)).toBe(1);
    expect(translationXOf(mesh, 1)).toBe(2);
  });

  // The whole point of the verb: the set* guard makes "write at instanceCount" a silent no-op, so
  // appending must raise the count before it writes or the matrix is dropped.
  it('writes a matrix that a bare set at the same index would have dropped', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 8);

    setInstancedMeshInstanceMatrix(mesh, 0, translation(9));
    expect(mesh.instanceCount).toBe(0);

    const index = appendInstancedMeshInstance(mesh, translation(9));
    expect(index).toBe(0);
    expect(translationXOf(mesh, 0)).toBe(9);
  });

  it('grows capacity past the initial allocation', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 2);
    for (let i = 0; i < 5; i++) appendInstancedMeshInstance(mesh, translation(i));

    expect(mesh.instanceCount).toBe(5);
    expect(getInstancedMeshCapacity(mesh)).toBeGreaterThanOrEqual(5);
    expect(translationXOf(mesh, 4)).toBe(4);
  });

  it('bumps the version', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 8);
    const before = mesh.version;
    appendInstancedMeshInstance(mesh, translation(1));
    expect(mesh.version).toBeGreaterThan(before);
  });

  it('emits onInstanceAppended with the new index when signals are enabled', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 8);
    const seen: number[] = [];
    connectSignal(enableInstancedMeshSignals(mesh).onInstanceAppended, (index) => seen.push(index));

    appendInstancedMeshInstance(mesh, translation(1));
    appendInstancedMeshInstance(mesh, translation(2));

    expect(seen).toEqual([0, 1]);
  });
});

describe('clearInstancedMesh', () => {
  it('drops the count to zero but keeps capacity', () => {
    const mesh = meshWith(1, 2, 3);
    const capacity = getInstancedMeshCapacity(mesh);

    clearInstancedMesh(mesh);

    expect(mesh.instanceCount).toBe(0);
    expect(getInstancedMeshCapacity(mesh)).toBe(capacity);
  });

  it('emits onCleared when signals are enabled', () => {
    const mesh = meshWith(1);
    let cleared = 0;
    connectSignal(enableInstancedMeshSignals(mesh).onCleared, () => cleared++);

    clearInstancedMesh(mesh);

    expect(cleared).toBe(1);
  });
});

describe('cloneInstancedMesh', () => {
  it('copies the live instances into independent matrices', () => {
    const source = meshWith(1, 2);

    const clone = cloneInstancedMesh(source);
    setInstancedMeshInstanceMatrix(clone, 0, translation(99));

    expect(clone.instanceCount).toBe(2);
    expect(translationXOf(clone, 1)).toBe(2);
    expect(translationXOf(source, 0)).toBe(1);
  });

  it('shares the geometry and copies the materials array', () => {
    const source = meshWith(1);

    const clone = cloneInstancedMesh(source);

    expect(clone.geometry).toBe(source.geometry);
    expect(clone.materials).not.toBe(source.materials);
    expect(clone.materials).toEqual(source.materials);
  });

  it('copies per-instance colors into an independent array', () => {
    const source = meshWith(1, 2);
    setInstancedMeshInstanceColor(source, 1, 0xff0000ff);

    const clone = cloneInstancedMesh(source);
    setInstancedMeshInstanceColor(clone, 1, 0x00ff00ff);

    expect(getInstancedMeshInstanceColor(source, 1)).toBe(0xff0000ff);
    expect(getInstancedMeshInstanceColor(clone, 1)).toBe(0x00ff00ff);
  });
});

describe('computeInstancedMeshLocalBoundsAabb', () => {
  it('spans every live instance, not just the geometry at the origin', () => {
    const mesh = meshWith(0, 10);
    const out = createAabb();

    computeInstancedMeshLocalBoundsAabb(out, mesh);

    // The box is 2 units wide, so instances at x=0 and x=10 span -1..11.
    expect(out.min.x).toBeCloseTo(-1);
    expect(out.max.x).toBeCloseTo(11);
  });

  it('writes an empty box for a batch with no instances', () => {
    const out = createAabb();

    computeInstancedMeshLocalBoundsAabb(out, createInstancedMesh(boundedBox(), [null], 8));

    expect(out.min.x).toBeGreaterThan(out.max.x);
  });

  it('ignores instances past the live count', () => {
    const mesh = meshWith(0, 10);
    removeInstancedMeshInstance(mesh, 1);
    const out = createAabb();

    computeInstancedMeshLocalBoundsAabb(out, mesh);

    expect(out.max.x).toBeCloseTo(1);
  });
});

describe('createInstancedMesh', () => {
  it('creates with zero instance count and the given geometry', () => {
    const geometry = boundedBox();
    const mesh = createInstancedMesh(geometry, [null]);

    expect(mesh.kind).toBe(InstancedMeshKind);
    expect(mesh.instanceCount).toBe(0);
    expect(mesh.geometry).toBe(geometry);
  });

  it('preallocates the requested capacity', () => {
    expect(getInstancedMeshCapacity(createInstancedMesh(boundedBox(), [null], 32))).toBe(32);
  });

  it('starts with no per-instance colors', () => {
    expect(createInstancedMesh(boundedBox(), [null]).instanceColors).toBeNull();
  });
});

describe('createInstancedMeshSignals', () => {
  it('creates an unconnected signal group', () => {
    const signals = createInstancedMeshSignals();

    expect(signals.onCleared).toBeDefined();
    expect(signals.onInstanceAppended).toBeDefined();
    expect(signals.onInstanceRemoved).toBeDefined();
  });
});

describe('enableInstancedMeshSignals', () => {
  it('returns the same group on repeat calls', () => {
    const mesh = meshWith(1);

    expect(enableInstancedMeshSignals(mesh)).toBe(enableInstancedMeshSignals(mesh));
  });
});

describe('getInstancedMeshCapacity', () => {
  it('reports allocated slots, not live instances', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 16);
    appendInstancedMeshInstance(mesh, translation(1));

    expect(mesh.instanceCount).toBe(1);
    expect(getInstancedMeshCapacity(mesh)).toBe(16);
  });
});

describe('getInstancedMeshInstanceColor', () => {
  it('reports opaque white for a live instance in an untinted batch', () => {
    expect(getInstancedMeshInstanceColor(meshWith(1), 0)).toBe(0xffffffff);
  });

  it('reports the color that was set', () => {
    const mesh = meshWith(1, 2);
    setInstancedMeshInstanceColor(mesh, 1, 0x11223344);

    expect(getInstancedMeshInstanceColor(mesh, 1)).toBe(0x11223344);
  });

  // -1 is not a representable packed color, so an out-of-range read cannot be confused with a real
  // one — the previous 0xffffffff sentinel was indistinguishable from an untinted instance.
  it('reports -1 out of range rather than a value that could be a real color', () => {
    const mesh = meshWith(1);

    expect(getInstancedMeshInstanceColor(mesh, 1)).toBe(-1);
    expect(getInstancedMeshInstanceColor(mesh, -1)).toBe(-1);
  });
});

describe('getInstancedMeshInstanceMatrix', () => {
  it('writes the matrix and reports true', () => {
    const mesh = meshWith(5);
    const out = createMatrix4();

    expect(getInstancedMeshInstanceMatrix(out, mesh, 0)).toBe(true);
    expect(out.m[12]).toBe(5);
  });

  it('reports false and leaves out untouched when out of range', () => {
    const mesh = meshWith(5);
    const out = translation(42);

    expect(getInstancedMeshInstanceMatrix(out, mesh, 3)).toBe(false);
    expect(getInstancedMeshInstanceMatrix(out, mesh, -1)).toBe(false);
    expect(out.m[12]).toBe(42);
  });
});

describe('getInstancedMeshSignals', () => {
  it('returns null until signals are enabled', () => {
    const mesh = meshWith(1);

    expect(getInstancedMeshSignals(mesh)).toBeNull();
    expect(getInstancedMeshSignals(mesh)).not.toBe(enableInstancedMeshSignals(mesh));
  });

  it('returns the enabled group', () => {
    const mesh = meshWith(1);
    const signals = enableInstancedMeshSignals(mesh);

    expect(getInstancedMeshSignals(mesh)).toBe(signals);
  });
});

describe('initializeInstancedMeshSignals', () => {
  it('fills every signal slot', () => {
    const out = {} as ReturnType<typeof createInstancedMeshSignals>;
    initializeInstancedMeshSignals(out);

    expect(out.onCleared).toBeDefined();
    expect(out.onInstanceAppended).toBeDefined();
    expect(out.onInstanceRemoved).toBeDefined();
  });
});

describe('invalidateInstancedMesh', () => {
  it('bumps the version', () => {
    const mesh = meshWith(1);
    const before = mesh.version;

    invalidateInstancedMesh(mesh);

    expect(mesh.version).toBe(before + 1);
  });
});

describe('isInstancedMesh', () => {
  it('accepts an instanced mesh and rejects other values', () => {
    expect(isInstancedMesh(meshWith(1))).toBe(true);
    expect(isInstancedMesh(null)).toBe(false);
    expect(isInstancedMesh({})).toBe(false);
  });
});

describe('iterateInstancedMeshInstances', () => {
  it('visits every live instance in order', () => {
    const mesh = meshWith(1, 2, 3);
    const seen: number[] = [];

    iterateInstancedMeshInstances(mesh, (index, matrix) => seen.push(index, matrix.m[12]));

    expect(seen).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it('does not visit slots past the live count', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 8);
    let visits = 0;

    iterateInstancedMeshInstances(mesh, () => visits++);

    expect(visits).toBe(0);
  });
});

describe('removeInstancedMeshInstance', () => {
  it('swaps the last instance into the hole and drops the count', () => {
    const mesh = meshWith(1, 2, 3);

    removeInstancedMeshInstance(mesh, 0);

    expect(mesh.instanceCount).toBe(2);
    expect(translationXOf(mesh, 0)).toBe(3);
    expect(translationXOf(mesh, 1)).toBe(2);
  });

  it('drops the count without moving anything when removing the last instance', () => {
    const mesh = meshWith(1, 2);

    removeInstancedMeshInstance(mesh, 1);

    expect(mesh.instanceCount).toBe(1);
    expect(translationXOf(mesh, 0)).toBe(1);
  });

  it('no-ops when out of range', () => {
    const mesh = meshWith(1, 2);

    removeInstancedMeshInstance(mesh, 2);
    removeInstancedMeshInstance(mesh, -1);

    expect(mesh.instanceCount).toBe(2);
  });

  it('moves the swapped instance color too', () => {
    const mesh = meshWith(1, 2, 3);
    setInstancedMeshInstanceColor(mesh, 2, 0xabcdefff);

    removeInstancedMeshInstance(mesh, 0);

    expect(getInstancedMeshInstanceColor(mesh, 0)).toBe(0xabcdefff);
  });

  // The swap source is what a consumer holding a parallel array needs: it says which element moved.
  it('reports the swap source, and -1 when nothing moved', () => {
    const mesh = meshWith(1, 2, 3);
    const seen: number[][] = [];
    connectSignal(enableInstancedMeshSignals(mesh).onInstanceRemoved, (index, swapSource) =>
      seen.push([index, swapSource]),
    );

    removeInstancedMeshInstance(mesh, 0);
    removeInstancedMeshInstance(mesh, 1);

    expect(seen).toEqual([
      [0, 2],
      [1, -1],
    ]);
  });
});

describe('reserveInstancedMesh', () => {
  it('grows capacity without changing the live count', () => {
    const mesh = meshWith(1);

    reserveInstancedMesh(mesh, 64);

    expect(getInstancedMeshCapacity(mesh)).toBeGreaterThanOrEqual(64);
    expect(mesh.instanceCount).toBe(1);
  });

  it('leaves capacity alone when it is already sufficient', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 32);

    reserveInstancedMesh(mesh, 8);

    expect(getInstancedMeshCapacity(mesh)).toBe(32);
  });

  it('extends the color array, defaulting the new slots to opaque white', () => {
    const mesh = meshWith(1);
    setInstancedMeshInstanceColor(mesh, 0, 0x11223344);

    reserveInstancedMesh(mesh, 64);
    setInstancedMeshInstanceCount(mesh, 2);

    expect(getInstancedMeshInstanceColor(mesh, 0)).toBe(0x11223344);
    expect(getInstancedMeshInstanceColor(mesh, 1)).toBe(0xffffffff);
  });
});

describe('setInstancedMeshInstanceColor', () => {
  it('allocates the color array on first use only', () => {
    const mesh = meshWith(1);
    expect(mesh.instanceColors).toBeNull();

    setInstancedMeshInstanceColor(mesh, 0, 0x11223344);

    expect(mesh.instanceColors).not.toBeNull();
  });

  it('no-ops out of range', () => {
    const mesh = meshWith(1);

    setInstancedMeshInstanceColor(mesh, 5, 0x11223344);
    setInstancedMeshInstanceColor(mesh, -1, 0x11223344);

    expect(mesh.instanceColors).toBeNull();
  });
});

describe('setInstancedMeshInstanceCount', () => {
  it('raises the count and grows capacity to fit', () => {
    const mesh = createInstancedMesh(boundedBox(), [null], 4);

    setInstancedMeshInstanceCount(mesh, 10);

    expect(mesh.instanceCount).toBe(10);
    expect(getInstancedMeshCapacity(mesh)).toBeGreaterThanOrEqual(10);
  });

  it('lowers the count without shrinking capacity', () => {
    const mesh = meshWith(1, 2, 3);
    const capacity = getInstancedMeshCapacity(mesh);

    setInstancedMeshInstanceCount(mesh, 1);

    expect(mesh.instanceCount).toBe(1);
    expect(getInstancedMeshCapacity(mesh)).toBe(capacity);
  });
});

describe('setInstancedMeshInstanceMatrix', () => {
  it('writes a live instance', () => {
    const mesh = meshWith(1);

    setInstancedMeshInstanceMatrix(mesh, 0, translation(7));

    expect(translationXOf(mesh, 0)).toBe(7);
  });

  // Documented refusal: an index past the live count names an instance that does not exist, and
  // growing here would let a typo'd index allocate.
  it('no-ops past the live count instead of growing', () => {
    const mesh = meshWith(1);

    setInstancedMeshInstanceMatrix(mesh, 1, translation(7));

    expect(mesh.instanceCount).toBe(1);
    expect(getInstancedMeshCapacity(mesh)).toBe(8);
  });

  it('no-ops on a negative index rather than throwing', () => {
    const mesh = meshWith(1);

    expect(() => setInstancedMeshInstanceMatrix(mesh, -1, translation(7))).not.toThrow();
    expect(translationXOf(mesh, 0)).toBe(1);
  });
});

describe('setInstancedMeshInstanceMatrixRange', () => {
  it('writes a contiguous run from a flat array', () => {
    const mesh = meshWith(0, 0, 0);
    const source = new Float32Array(2 * 16);
    source.set(translation(4).m, 0);
    source.set(translation(5).m, 16);

    setInstancedMeshInstanceMatrixRange(mesh, 1, 2, source);

    expect(translationXOf(mesh, 0)).toBe(0);
    expect(translationXOf(mesh, 1)).toBe(4);
    expect(translationXOf(mesh, 2)).toBe(5);
  });

  it('invalidates once for the whole range', () => {
    const mesh = meshWith(0, 0, 0);
    const source = new Float32Array(3 * 16);
    const before = mesh.version;

    setInstancedMeshInstanceMatrixRange(mesh, 0, 3, source);

    expect(mesh.version).toBe(before + 1);
  });

  it('no-ops when the range runs past the live count', () => {
    const mesh = meshWith(1, 2);
    const source = new Float32Array(3 * 16);
    source.set(translation(9).m, 0);

    setInstancedMeshInstanceMatrixRange(mesh, 1, 2, source);

    expect(translationXOf(mesh, 1)).toBe(2);
  });

  it('no-ops when the source is too short for the requested count', () => {
    const mesh = meshWith(1, 2);
    const source = new Float32Array(16);

    setInstancedMeshInstanceMatrixRange(mesh, 0, 2, source);

    expect(translationXOf(mesh, 0)).toBe(1);
  });
});
