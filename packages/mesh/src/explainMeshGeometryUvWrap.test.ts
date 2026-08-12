import type { MeshGeometry } from '@flighthq/types/contract';

import {
  createDodecahedronMeshGeometry,
  createMeshGeometry,
  createMeshGeometryFromAttributes,
  createPlaneMeshGeometry,
  getMeshGeometryTriangleCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexUv0,
  offsetMeshGeometryUvs,
  wrapMeshGeometryUvs,
} from './contract';
import { explainMeshGeometryUvWrap } from './explainMeshGeometryUvWrap';

// One triangle per row of `uvRows`, non-indexed, positions irrelevant to the question being asked.
function triangleList(uvRows: readonly (readonly number[])[]): MeshGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const row of uvRows) {
    for (let corner = 0; corner < 3; corner++) {
      positions.push(corner, 0, 0);
      uvs.push(row[corner * 2], row[corner * 2 + 1]);
    }
  }
  return createMeshGeometryFromAttributes({ positions, uvs });
}

function readUvs(geometry: Readonly<MeshGeometry>): number[][] {
  const out: number[][] = [];
  const uv = { x: 0, y: 0 };
  for (let i = 0; i < getMeshGeometryVertexCount(geometry); i++) {
    getMeshGeometryVertexUv0(uv, geometry, i);
    out.push([uv.x, uv.y]);
  }
  return out;
}

describe('explainMeshGeometryUvWrap', () => {
  // The query's whole claim is that a torn primitive is one the fold damages. This is the case that
  // makes it a measurement rather than an assertion about arithmetic: the plane is reported torn, and
  // the fold is then actually run and observed to flatten all four corners onto a single point. If the
  // predicate were wrong in either direction, these two halves would disagree.
  it('agrees with what the fold does to a 0..1 plane, corner for corner', () => {
    const plane = createPlaneMeshGeometry(1, 1, 1, 1);
    const before = readUvs(plane);
    expect(before).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);

    const wrap = explainMeshGeometryUvWrap(plane);
    expect(wrap.tornPrimitiveCount).toBe(2);
    expect(wrap.tearsU).toBe(true);
    expect(wrap.tearsV).toBe(true);

    wrapMeshGeometryUvs(plane);
    // Every distinct coordinate collapsed onto one — the mapping is gone, which is what "torn" claimed.
    expect(readUvs(plane)).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  // The discriminating case, and the reason the predicate is a straddle rather than "outside [0, 1)".
  // These coordinates are entirely outside the unit tile, which is exactly the input the operation
  // documents itself for; every primitive sits wholly inside tile 1, so the fold is one uniform shift
  // and changes no sampling. A predicate that flagged out-of-range coordinates would fire here, on the
  // one input where wrapping is the right call.
  it('does not report a tear when a primitive lies wholly inside a tile other than the first', () => {
    const shifted = triangleList([[1.2, 1.2, 1.8, 1.2, 1.2, 1.8]]);

    const wrap = explainMeshGeometryUvWrap(shifted);

    expect(wrap.primitiveCount).toBe(1);
    expect(wrap.tornPrimitiveCount).toBe(0);
    expect(wrap.firstTornPrimitive).toBe(-1);
    expect(wrap.tearsU).toBe(false);
    expect(wrap.tearsV).toBe(false);
  });

  // A polyhedron built through the spherical mapping carries u > 1 on its seam faces deliberately, so
  // that a face crosses the longitude seam forwards instead of backwards across the whole texture. It
  // is the motivating case: correct geometry the fold would destroy.
  it('reports the longitude seam of a spherically mapped solid as a u-only tear', () => {
    const solid = createDodecahedronMeshGeometry();

    const wrap = explainMeshGeometryUvWrap(solid);

    expect(wrap.tornPrimitiveCount).toBeGreaterThan(0);
    expect(wrap.tearsU).toBe(true);
    expect(wrap.primitiveCount).toBe(getMeshGeometryTriangleCount(solid));
  });

  // Separated because the axis names the cause — a longitude seam is u, a pole-wrapped map is v — and a
  // single `torn` boolean would leave a caller unable to tell which parameterisation they were looking at.
  it('separates the axes, so a tear in one is not reported in the other', () => {
    const acrossU = triangleList([[0.9, 0.5, 1.1, 0.5, 0.9, 0.6]]);
    const acrossV = triangleList([[0.5, 0.9, 0.5, 1.1, 0.6, 0.9]]);

    expect(explainMeshGeometryUvWrap(acrossU)).toMatchObject({ tearsU: true, tearsV: false });
    expect(explainMeshGeometryUvWrap(acrossV)).toMatchObject({ tearsU: false, tearsV: true });
  });

  it('counts every primitive and names the first torn one, not just whether any tore', () => {
    const geometry = triangleList([
      [0.1, 0.1, 0.2, 0.1, 0.1, 0.2],
      [0.9, 0.1, 1.1, 0.1, 0.9, 0.2],
      [0.3, 0.3, 0.4, 0.3, 0.3, 0.4],
      [1.9, 0.1, 2.1, 0.1, 1.9, 0.2],
    ]);

    const wrap = explainMeshGeometryUvWrap(geometry);

    expect(wrap.primitiveCount).toBe(4);
    expect(wrap.tornPrimitiveCount).toBe(2);
    expect(wrap.firstTornPrimitive).toBe(1);
  });

  // A geometry the operation would no-op on has nothing to explain, and reporting zero primitives is
  // how a caller tells that apart from "examined them and found nothing wrong".
  it('reports no primitives when the layout carries no uv0 channel', () => {
    const geometry = createMeshGeometry({
      layout: { attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }], stride: 12 },
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    });

    expect(explainMeshGeometryUvWrap(geometry)).toEqual({
      firstTornPrimitive: -1,
      primitiveCount: 0,
      tearsU: false,
      tearsV: false,
      tornPrimitiveCount: 0,
    });
  });

  it('is pure — it neither mutates the geometry nor bumps its version', () => {
    const plane = createPlaneMeshGeometry(1, 1, 1, 1);
    offsetMeshGeometryUvs(plane, 0.25, 0.25);
    const vertices = Float32Array.from(plane.vertices);
    const version = plane.version;

    explainMeshGeometryUvWrap(plane);

    expect(plane.vertices).toEqual(vertices);
    expect(plane.version).toBe(version);
  });
});
