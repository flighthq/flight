import type { MeshGeometry } from '@flighthq/types/contract';

import { createMeshGeometry, createPlaneMeshGeometry, wrapMeshGeometryUvs } from './contract';
import { reportMeshGeometryUvWrap, setMeshGeometryUvWrapGuard } from './meshGeometryGuards';

afterEach(() => {
  setMeshGeometryUvWrapGuard(null);
});

describe('reportMeshGeometryUvWrap', () => {
  it('does nothing when no guard is installed', () => {
    expect(() => reportMeshGeometryUvWrap(createPlaneMeshGeometry(1, 1, 1, 1))).not.toThrow();
  });

  it('hands the guard the geometry it was called with', () => {
    const seen: MeshGeometry[] = [];
    setMeshGeometryUvWrapGuard((geometry) => seen.push(geometry as MeshGeometry));
    const plane = createPlaneMeshGeometry(1, 1, 1, 1);

    reportMeshGeometryUvWrap(plane);

    expect(seen).toEqual([plane]);
  });
});

describe('setMeshGeometryUvWrapGuard', () => {
  // The seam has to fire before the fold, not after: afterwards every coordinate sits in tile 0 and the
  // straddle the guard exists to see is gone from the data. Reading the UVs from inside the guard is the
  // only way to tell the two orderings apart — a guard called after the fold would observe 0,0,0,0.
  it('is called by wrapMeshGeometryUvs before the coordinates are folded', () => {
    let observed: number[] = [];
    setMeshGeometryUvWrapGuard((geometry) => {
      observed = Array.from(geometry.vertices);
    });
    const plane = createPlaneMeshGeometry(1, 1, 1, 1);
    const before = Array.from(plane.vertices);

    wrapMeshGeometryUvs(plane);

    expect(observed).toEqual(before);
    expect(Array.from(plane.vertices)).not.toEqual(before);
  });

  // The operation no-ops without a uv0 channel, so there is no misuse to report and the guard must not
  // fire. A guard that announced a tear on geometry nothing would touch is pure noise.
  it('is not called when the layout carries no uv0 channel', () => {
    let calls = 0;
    setMeshGeometryUvWrapGuard(() => calls++);
    const geometry = createMeshGeometry({
      layout: { attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }], stride: 12 },
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    });

    wrapMeshGeometryUvs(geometry);

    expect(calls).toBe(0);
  });

  it('replaces rather than accumulates, so installing twice leaves one guard', () => {
    let first = 0;
    let second = 0;
    setMeshGeometryUvWrapGuard(() => first++);
    setMeshGeometryUvWrapGuard(() => second++);

    wrapMeshGeometryUvs(createPlaneMeshGeometry(1, 1, 1, 1));

    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it('uninstalls on null', () => {
    let calls = 0;
    setMeshGeometryUvWrapGuard(() => calls++);
    setMeshGeometryUvWrapGuard(null);

    wrapMeshGeometryUvs(createPlaneMeshGeometry(1, 1, 1, 1));

    expect(calls).toBe(0);
  });
});
