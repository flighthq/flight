import { createAabb } from '@flighthq/geometry';
import type { MeshGeometry, VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import { computeMeshGeometryBounds, computeMeshGeometryTangents } from './meshGeometryCompute';

// Primitive builders for the canonical interleaved PBR vertex record:
//   position(3) + normal(3) + tangent(4, w = handedness) + uv0(2) = 12 f32 / 48 bytes.
// Coordinate and winding convention is pinned across the 3D suite: RIGHT-HANDED coordinates,
// COUNTER-CLOCKWISE (CCW) front faces, and the tangent `w` component is the bitangent sign per
// glTF — bitangent = cross(normal, tangent.xyz) * tangent.w. Every builder writes outward-facing
// normals, generates UVs, computes per-vertex tangents (via computeMeshGeometryTangents, which
// sets the correct w-sign from the UV gradient), and fills the cached local-space bounds.

// Builds an axis-aligned box of the given dimensions centered at the origin, one quad per face
// with per-face outward normals and per-face 0..1 UVs (so each face textures independently).
export function createBoxMeshGeometry(width: number = 1, height: number = 1, depth: number = 1): MeshGeometry {
  const hx = width * 0.5,
    hy = height * 0.5,
    hz = depth * 0.5;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Each face: origin corner, then two edge vectors (u across, v up) spanning the quad.
  const addFace = (
    ox: number,
    oy: number,
    oz: number,
    ux: number,
    uy: number,
    uz: number,
    vx: number,
    vy: number,
    vz: number,
    nx: number,
    ny: number,
    nz: number,
  ): void => {
    const start = positions.length / 3;
    for (let iv = 0; iv < 2; iv++) {
      for (let iu = 0; iu < 2; iu++) {
        positions.push(ox + ux * iu + vx * iv, oy + uy * iu + vy * iv, oz + uz * iu + vz * iv);
        normals.push(nx, ny, nz);
        uvs.push(iu, iv);
      }
    }
    indices.push(start, start + 1, start + 3, start, start + 3, start + 2);
  };

  // +X, -X, +Y, -Y, +Z, -Z (each winds CCW when viewed from outside along its normal).
  addFace(hx, -hy, hz, 0, 0, -depth, 0, height, 0, 1, 0, 0);
  addFace(-hx, -hy, -hz, 0, 0, depth, 0, height, 0, -1, 0, 0);
  addFace(-hx, hy, hz, width, 0, 0, 0, 0, -depth, 0, 1, 0);
  addFace(-hx, -hy, -hz, width, 0, 0, 0, 0, depth, 0, -1, 0);
  addFace(-hx, -hy, hz, width, 0, 0, 0, height, 0, 0, 0, 1);
  addFace(hx, -hy, -hz, -width, 0, 0, 0, height, 0, 0, 0, -1);

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a capsule (a cylinder capped by two hemispheres) of `radius` and cylindrical `height`
// (excluding the caps) centered at the origin, with `radialSegments` around the axis and
// `capSegments` latitudinal divisions per hemisphere. Normals are smooth across the seam between
// the caps and the side wall. UVs run v from 0 (top) to 1 (bottom) along the full length.
export function createCapsuleMeshGeometry(
  radius: number = 0.5,
  height: number = 1,
  radialSegments: number = 16,
  capSegments: number = 8,
): MeshGeometry {
  const rSeg = Math.max(3, radialSegments);
  const cSeg = Math.max(1, capSegments);
  const halfH = height * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Helper: emit a ring of vertices at normalized latitude `phi` from the sphere pole.
  // `yOffset` shifts the ring center (0 = top hemisphere center, -height = bottom center).
  const addRing = (phi: number, yOffset: number): void => {
    const sinPhi = Math.sin(phi),
      cosPhi = Math.cos(phi);
    for (let i = 0; i <= rSeg; i++) {
      const theta = (i / rSeg) * Math.PI * 2;
      const cosTheta = Math.cos(theta),
        sinTheta = Math.sin(theta);
      const nx = sinPhi * cosTheta,
        ny = cosPhi,
        nz = sinPhi * sinTheta;
      positions.push(radius * nx, radius * ny + yOffset, radius * nz);
      normals.push(nx, ny, nz);
      uvs.push(i / rSeg, 0); // v assigned after all rings are created
    }
  };

  const ringVertexCount = rSeg + 1;
  const vDivisor = 2 * cSeg + 1; // total number of rings minus 1

  // Top hemisphere (phi from 0 to PI/2).
  for (let j = 0; j <= cSeg; j++) {
    addRing((j / cSeg) * (Math.PI * 0.5), halfH);
  }
  // Bottom hemisphere (phi from PI/2 to PI).
  for (let j = 1; j <= cSeg; j++) {
    addRing(Math.PI * 0.5 + (j / cSeg) * (Math.PI * 0.5), -halfH);
  }

  // Fix up the v UV coordinate.
  const ringCount = 2 * cSeg + 1;
  for (let j = 0; j < ringCount; j++) {
    const v = j / vDivisor;
    for (let i = 0; i <= rSeg; i++) {
      uvs[(j * ringVertexCount + i) * 2 + 1] = v;
    }
  }

  // Connect rings into quads.
  const totalRings = 2 * cSeg + 1;
  for (let j = 0; j < totalRings - 1; j++) {
    for (let i = 0; i < rSeg; i++) {
      const a = j * ringVertexCount + i;
      const b = a + 1;
      const c = a + ringVertexCount;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a flat filled circle (disc) in the XZ plane centered at the origin. Normal is +Y.
// `radius` is the outer radius; `segments` is the number of rim vertices. A center vertex fans
// out to `segments` rim vertices via a triangle fan, so the result is `segments` triangles.
// UVs map from the disc plane onto 0..1 with (0.5, 0.5) at the center.
export function createCircleMeshGeometry(radius: number = 0.5, segments: number = 32): MeshGeometry {
  const segs = Math.max(3, segments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  addDisc(positions, normals, uvs, indices, segs, radius, 0, 1);
  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a right circular cone of `radius` and `height` centered at the origin, apex at +Y, base
// at -Y, with `radialSegments` around the axis. A capped base disc is included when `capped` is
// true (default). Side normals are smooth around the ring and slanted by the cone half-angle.
export function createConeMeshGeometry(
  radius: number = 0.5,
  height: number = 1,
  radialSegments: number = 32,
  capped: boolean = true,
): MeshGeometry {
  return createCylinderMeshGeometry(0, radius, height, radialSegments, capped);
}

// Builds a right circular cylinder spanning -height/2..+height/2 on the Y axis, with independent
// top (`topRadius`) and bottom (`bottomRadius`) radii so it also serves as a truncated cone (a
// zero top radius yields a cone). `radialSegments` rings around the axis; `capped` adds top and
// bottom discs (skipping a zero-radius cap).
export function createCylinderMeshGeometry(
  topRadius: number = 0.5,
  bottomRadius: number = 0.5,
  height: number = 1,
  radialSegments: number = 32,
  capped: boolean = true,
): MeshGeometry {
  const segments = Math.max(3, radialSegments);
  const halfHeight = height * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Side wall: slope of the silhouette feeds the radial normal tilt.
  const slope = (bottomRadius - topRadius) / height;
  const sideStart = positions.length / 3;
  for (let y = 0; y <= 1; y++) {
    const radius = y === 0 ? bottomRadius : topRadius;
    const py = y === 0 ? -halfHeight : halfHeight;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const cos = Math.cos(theta),
        sin = Math.sin(theta);
      positions.push(radius * cos, py, radius * sin);
      // Outward radial normal tilted by the cone slope; +Y component points toward the narrow end.
      let nx = cos,
        ny = slope,
        nz = sin;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      normals.push(nx, ny, nz);
      uvs.push(s / segments, y);
    }
  }
  for (let s = 0; s < segments; s++) {
    const a = sideStart + s;
    const b = sideStart + s + 1;
    const c = sideStart + (segments + 1) + s;
    const d = sideStart + (segments + 1) + s + 1;
    indices.push(a, c, b, b, c, d);
  }

  if (capped) {
    if (bottomRadius > 0) {
      addDisc(positions, normals, uvs, indices, segments, bottomRadius, -halfHeight, -1);
    }
    if (topRadius > 0) {
      addDisc(positions, normals, uvs, indices, segments, topRadius, halfHeight, 1);
    }
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a regular dodecahedron (12 pentagonal faces, triangulated) inscribed in a sphere of `radius`.
export function createDodecahedronMeshGeometry(radius: number = 0.5, detail: number = 0): MeshGeometry {
  return createPolyhedronMeshGeometry(DODECAHEDRON_VERTS, DODECAHEDRON_FACES, radius, detail);
}

// Builds a regular icosahedron (20 triangular faces) inscribed in a sphere of `radius`.
// This is the base shape for createIcosphereMeshGeometry at detail=0.
export function createIcosahedronMeshGeometry(radius: number = 0.5, detail: number = 0): MeshGeometry {
  return createPolyhedronMeshGeometry(ICOSAHEDRON_VERTS, ICOSAHEDRON_FACES, radius, detail);
}

// Builds a geodesic icosphere of `radius` centered at the origin. Unlike the UV sphere,
// an icosphere distributes triangles evenly over the surface without pole pinching. Starting
// from a regular icosahedron, each face is subdivided `subdivisions` times (0 = raw icosahedron,
// 1 = 80 triangles, 2 = 320, etc.). Normals are the unit-sphere position direction; UVs are
// spherical (longitude/latitude).
export function createIcosphereMeshGeometry(radius: number = 0.5, subdivisions: number = 2): MeshGeometry {
  const subs = Math.max(0, Math.min(subdivisions, 6)); // cap at 6 to prevent > 262k triangles

  // Icosahedron base vertices (unit sphere).
  const phi = (1 + Math.sqrt(5)) * 0.5;
  const scale = 1 / Math.sqrt(1 + phi * phi);
  const baseVerts = (
    [
      [-1, phi, 0],
      [1, phi, 0],
      [-1, -phi, 0],
      [1, -phi, 0],
      [0, -1, phi],
      [0, 1, phi],
      [0, -1, -phi],
      [0, 1, -phi],
      [phi, 0, -1],
      [phi, 0, 1],
      [-phi, 0, -1],
      [-phi, 0, 1],
    ] as ReadonlyArray<readonly [number, number, number]>
  ).map(([x, y, z]) => [x * scale, y * scale, z * scale] as [number, number, number]);

  const verts = baseVerts.map((v) => [...v] as [number, number, number]);
  let faces: Array<[number, number, number]> = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  // Midpoint cache to avoid duplicate vertices.
  const midpointCache = new Map<string, number>();
  const getMidpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = midpointCache.get(key);
    if (cached !== undefined) return cached;
    const va = verts[a],
      vb = verts[b];
    let mx = (va[0] + vb[0]) * 0.5,
      my = (va[1] + vb[1]) * 0.5,
      mz = (va[2] + vb[2]) * 0.5;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    mx /= len;
    my /= len;
    mz /= len;
    const idx = verts.length;
    verts.push([mx, my, mz]);
    midpointCache.set(key, idx);
    return idx;
  };

  for (let s = 0; s < subs; s++) {
    const newFaces: Array<[number, number, number]> = [];
    for (const [a, b, c] of faces) {
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = newFaces;
    midpointCache.clear();
  }

  // Build positions/normals/uvs/indices from the subdivided icosahedron.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const faceIndices: number[] = [];

  // Emit unique vertices with spherical UVs. Since the seam is complex for an icosphere,
  // we emit independent vertices per face (non-indexed, then buildCanonicalMeshGeometry).
  for (const [a, b, c] of faces) {
    for (const vi of [a, b, c]) {
      const v = verts[vi];
      const nx = v[0],
        ny = v[1],
        nz = v[2];
      positions.push(radius * nx, radius * ny, radius * nz);
      normals.push(nx, ny, nz);
      // Spherical UV: u=longitude (0..1), v=latitude (0..1, 0=top).
      const u = 0.5 + Math.atan2(nz, nx) / (Math.PI * 2);
      const sv = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      uvs.push(u, sv);
    }
  }
  for (let i = 0; i < positions.length / 3; i++) {
    faceIndices.push(i);
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, faceIndices);
}

// Builds a regular octahedron (8 triangular faces) inscribed in a sphere of `radius`.
export function createOctahedronMeshGeometry(radius: number = 0.5, detail: number = 0): MeshGeometry {
  return createPolyhedronMeshGeometry(OCTAHEDRON_VERTS, OCTAHEDRON_FACES, radius, detail);
}

// Builds a flat plane in the XZ plane (Y up, normal +Y) centered at the origin, subdivided into
// `widthSegments` x `depthSegments` quads with a 0..1 UV grid. Suitable as a ground plane or a
// textured "panel" mesh.
export function createPlaneMeshGeometry(
  width: number = 1,
  depth: number = 1,
  widthSegments: number = 1,
  depthSegments: number = 1,
): MeshGeometry {
  const wSeg = Math.max(1, widthSegments);
  const dSeg = Math.max(1, depthSegments);
  const hw = width * 0.5,
    hd = depth * 0.5;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= dSeg; iz++) {
    const v = iz / dSeg;
    const z = -hd + v * depth;
    for (let ix = 0; ix <= wSeg; ix++) {
      const u = ix / wSeg;
      const x = -hw + u * width;
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }

  const rowStride = wSeg + 1;
  for (let iz = 0; iz < dSeg; iz++) {
    for (let ix = 0; ix < wSeg; ix++) {
      const a = iz * rowStride + ix;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      // CCW when viewed from +Y (above).
      indices.push(a, c, b, b, c, d);
    }
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a polyhedron from an explicit set of unit-sphere vertex positions and face triplets.
// `radius` scales the result; `detail` subdivides each face for a smoother sphere approximation.
// This is the shared backend for the Platonic solid builders and is also exported for custom
// polyhedra. Vertices are projected onto the unit sphere before scaling so the output is a
// geodesic sphere approximation.
export function createPolyhedronMeshGeometry(
  vertexPositions: readonly (readonly [number, number, number])[],
  faceIndices: readonly (readonly [number, number, number])[],
  radius: number = 0.5,
  detail: number = 0,
): MeshGeometry {
  const subs = Math.max(0, Math.min(detail, 5));
  const verts: Array<[number, number, number]> = vertexPositions.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });
  let faces: Array<[number, number, number]> = faceIndices.map((f) => [f[0], f[1], f[2]]);

  if (subs > 0) {
    const midCache = new Map<string, number>();
    const getMid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midCache.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a],
        vb = verts[b];
      let mx = (va[0] + vb[0]) * 0.5,
        my = (va[1] + vb[1]) * 0.5,
        mz = (va[2] + vb[2]) * 0.5;
      const mlen = Math.sqrt(mx * mx + my * my + mz * mz);
      mx /= mlen;
      my /= mlen;
      mz /= mlen;
      const idx = verts.length;
      verts.push([mx, my, mz]);
      midCache.set(key, idx);
      return idx;
    };
    for (let s = 0; s < subs; s++) {
      const newFaces: Array<[number, number, number]> = [];
      for (const [a, b, c] of faces) {
        const ab = getMid(a, b),
          bc = getMid(b, c),
          ca = getMid(c, a);
        newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = newFaces;
      midCache.clear();
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const flatIndices: number[] = [];
  for (const [a, b, c] of faces) {
    for (const vi of [a, b, c]) {
      const v = verts[vi];
      const nx = v[0],
        ny = v[1],
        nz = v[2];
      positions.push(radius * nx, radius * ny, radius * nz);
      normals.push(nx, ny, nz);
      const u = 0.5 + Math.atan2(nz, nx) / (Math.PI * 2);
      const sv = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      uvs.push(u, sv);
    }
  }
  for (let i = 0; i < positions.length / 3; i++) flatIndices.push(i);

  return buildCanonicalMeshGeometry(positions, normals, uvs, flatIndices);
}

// Builds a single unit quad in the XY plane (Z up, normal +Z) centered at the origin, two
// triangles with a 0..1 UV. The minimal textured surface — the building block for screen-facing
// panels and sprites in 3D.
export function createQuadMeshGeometry(width: number = 1, height: number = 1): MeshGeometry {
  const hw = width * 0.5,
    hh = height * 0.5;
  const positions = [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 0, 1, 1, 1];
  const indices = [0, 1, 2, 2, 1, 3];
  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a flat ring (annulus) in the XZ plane centered at the origin. `innerRadius` is the
// hole radius and `outerRadius` is the ring's outer edge. Normal is +Y. `segments` is the
// number of vertices around the ring. UVs map inner radius to u=0 and outer to u=1.
export function createRingMeshGeometry(
  innerRadius: number = 0.25,
  outerRadius: number = 0.5,
  segments: number = 32,
): MeshGeometry {
  const segs = Math.max(3, segments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    const cos = Math.cos(theta),
      sin = Math.sin(theta);
    // Inner vertex.
    positions.push(innerRadius * cos, 0, innerRadius * sin);
    normals.push(0, 1, 0);
    uvs.push(0, i / segs);
    // Outer vertex.
    positions.push(outerRadius * cos, 0, outerRadius * sin);
    normals.push(0, 1, 0);
    uvs.push(1, i / segs);
  }

  for (let i = 0; i < segs; i++) {
    const inner0 = i * 2;
    const outer0 = i * 2 + 1;
    const inner1 = (i + 1) * 2;
    const outer1 = (i + 1) * 2 + 1;
    // CCW from above (+Y).
    indices.push(inner0, inner1, outer0, outer0, inner1, outer1);
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a UV sphere of `radius` centered at the origin, with `widthSegments` longitudinal and
// `heightSegments` latitudinal divisions. Normals are the unit position direction; UVs map
// longitude to u and latitude to v.
export function createSphereMeshGeometry(
  radius: number = 0.5,
  widthSegments: number = 32,
  heightSegments: number = 16,
): MeshGeometry {
  const wSeg = Math.max(3, widthSegments);
  const hSeg = Math.max(2, heightSegments);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= hSeg; iy++) {
    const v = iy / hSeg;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi),
      cosPhi = Math.cos(phi);
    for (let ix = 0; ix <= wSeg; ix++) {
      const u = ix / wSeg;
      const theta = u * Math.PI * 2;
      const sinTheta = Math.sin(theta),
        cosTheta = Math.cos(theta);
      const nx = -sinPhi * cosTheta;
      const ny = cosPhi;
      const nz = sinPhi * sinTheta;
      positions.push(radius * nx, radius * ny, radius * nz);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }

  const rowStride = wSeg + 1;
  for (let iy = 0; iy < hSeg; iy++) {
    for (let ix = 0; ix < wSeg; ix++) {
      const a = iy * rowStride + ix;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a regular tetrahedron (4 triangular faces) inscribed in a sphere of `radius`.
export function createTetrahedronMeshGeometry(radius: number = 0.5, detail: number = 0): MeshGeometry {
  return createPolyhedronMeshGeometry(TETRAHEDRON_VERTS, TETRAHEDRON_FACES, radius, detail);
}

// Builds a torus knot: a torus-shaped curve wound `p` times around the Z axis and `q` times
// around the tube axis. `radius` is the distance from the center to the tube center line;
// `tube` is the tube radius. Normals and UVs are generated per the standard torus knot geometry.
export function createTorusKnotMeshGeometry(
  radius: number = 0.5,
  tube: number = 0.15,
  tubularSegments: number = 64,
  radialSegments: number = 8,
  p: number = 2,
  q: number = 3,
): MeshGeometry {
  const tSeg = Math.max(3, tubularSegments);
  const rSeg = Math.max(3, radialSegments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Compute a point on the torus knot curve at parameter `t`.
  const curvePoint = (t: number): [number, number, number] => {
    const angle = t * Math.PI * 2;
    const x = (radius + tube) * Math.cos(p * angle) * Math.cos(q * angle);
    const y = (radius + tube) * Math.cos(p * angle) * Math.sin(q * angle);
    const z = (radius + tube) * Math.sin(p * angle);
    return [x, y, z];
  };

  for (let i = 0; i <= tSeg; i++) {
    const u = i / tSeg;
    const [cx, cy, cz] = curvePoint(u);
    // Tangent via finite difference.
    const [tx1, ty1, tz1] = curvePoint(u + 0.001);
    const [tx0, ty0, tz0] = curvePoint(u - 0.001);
    let tgx = tx1 - tx0,
      tgy = ty1 - ty0,
      tgz = tz1 - tz0;
    const tgLen = Math.sqrt(tgx * tgx + tgy * tgy + tgz * tgz) || 1;
    tgx /= tgLen;
    tgy /= tgLen;
    tgz /= tgLen;
    // Normal using Frenet-Serret: reference up vector.
    let bx = tgx + cx,
      by = tgy + cy,
      bz = tgz + cz;
    const bLen = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
    bx /= bLen;
    by /= bLen;
    bz /= bLen;
    // Normal = cross(tangent, binormal).
    let nnx = tgy * bz - tgz * by;
    let nny = tgz * bx - tgx * bz;
    let nnz = tgx * by - tgy * bx;
    const nLen = Math.sqrt(nnx * nnx + nny * nny + nnz * nnz) || 1;
    nnx /= nLen;
    nny /= nLen;
    nnz /= nLen;
    // Binormal = cross(tangent, normal).
    const bnx = tgy * nnz - tgz * nny;
    const bny = tgz * nnx - tgx * nnz;
    const bnz = tgx * nny - tgy * nnx;
    for (let j = 0; j <= rSeg; j++) {
      const v = j / rSeg;
      const phi = v * Math.PI * 2;
      const cosPhi = Math.cos(phi),
        sinPhi = Math.sin(phi);
      const px = cx + tube * (cosPhi * nnx + sinPhi * bnx);
      const py = cy + tube * (cosPhi * nny + sinPhi * bny);
      const pz = cz + tube * (cosPhi * nnz + sinPhi * bnz);
      positions.push(px, py, pz);
      normals.push(cosPhi * nnx + sinPhi * bnx, cosPhi * nny + sinPhi * bny, cosPhi * nnz + sinPhi * bnz);
      uvs.push(u, v);
    }
  }

  const rowStride = rSeg + 1;
  for (let i = 0; i < tSeg; i++) {
    for (let j = 0; j < rSeg; j++) {
      const a = i * rowStride + j;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Builds a torus in the XY plane: a ring of `radius` (center to tube center) with a tube of
// `tube` radius, divided into `radialSegments` around the ring and `tubularSegments` around the
// tube. Normals point radially outward from the tube center.
export function createTorusMeshGeometry(
  radius: number = 0.5,
  tube: number = 0.2,
  radialSegments: number = 24,
  tubularSegments: number = 48,
): MeshGeometry {
  const rSeg = Math.max(3, radialSegments);
  const tSeg = Math.max(3, tubularSegments);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= rSeg; j++) {
    const v = (j / rSeg) * Math.PI * 2;
    const cosV = Math.cos(v),
      sinV = Math.sin(v);
    for (let i = 0; i <= tSeg; i++) {
      const u = (i / tSeg) * Math.PI * 2;
      const cosU = Math.cos(u),
        sinU = Math.sin(u);
      const cx = radius * cosU;
      const cy = radius * sinU;
      const px = (radius + tube * cosV) * cosU;
      const py = (radius + tube * cosV) * sinU;
      const pz = tube * sinV;
      positions.push(px, py, pz);
      let nx = px - cx,
        ny = py - cy,
        nz = pz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      normals.push(nx, ny, nz);
      uvs.push(i / tSeg, j / rSeg);
    }
  }

  const rowStride = tSeg + 1;
  for (let j = 0; j < rSeg; j++) {
    for (let i = 0; i < tSeg; i++) {
      const a = j * rowStride + i;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  return buildCanonicalMeshGeometry(positions, normals, uvs, indices);
}

// Adds a flat circular cap disc at the given Y plane: a center vertex fanned to a ring of
// `segments` rim vertices. `direction` is +1 for a top cap (normal +Y, CCW from above) and -1
// for a bottom cap (normal -Y, CCW from below).
function addDisc(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  segments: number,
  radius: number,
  y: number,
  direction: number,
): void {
  const center = positions.length / 3;
  positions.push(0, y, 0);
  normals.push(0, direction, 0);
  uvs.push(0.5, 0.5);

  const ringStart = positions.length / 3;
  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    const cos = Math.cos(theta),
      sin = Math.sin(theta);
    positions.push(radius * cos, y, radius * sin);
    normals.push(0, direction, 0);
    uvs.push(cos * 0.5 + 0.5, sin * 0.5 + 0.5);
  }

  for (let s = 0; s < segments; s++) {
    const a = ringStart + s;
    const b = ringStart + s + 1;
    if (direction > 0) {
      indices.push(center, a, b);
    } else {
      indices.push(center, b, a);
    }
  }
}

// Interleaves separate position/normal/uv0 arrays into the canonical 12-float record, allocates
// the MeshGeometry (indices auto-promote past 65k), then fills tangents from the UV gradient and
// the cached local bounds. The single finalize path every builder funnels through.
function buildCanonicalMeshGeometry(
  positions: readonly number[],
  normals: readonly number[],
  uvs: readonly number[],
  indices: readonly number[],
): MeshGeometry {
  const vertexCount = positions.length / 3;
  const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);

  for (let i = 0; i < vertexCount; i++) {
    const base = i * CANONICAL_FLOATS_PER_VERTEX;
    vertices[base] = positions[i * 3];
    vertices[base + 1] = positions[i * 3 + 1];
    vertices[base + 2] = positions[i * 3 + 2];
    vertices[base + 3] = normals[i * 3];
    vertices[base + 4] = normals[i * 3 + 1];
    vertices[base + 5] = normals[i * 3 + 2];
    // tangent (base+6..9) is filled by computeMeshGeometryTangents below.
    vertices[base + 10] = uvs[i * 2];
    vertices[base + 11] = uvs[i * 2 + 1];
  }

  const indexArray = new Uint32Array(indices.length);
  indexArray.set(indices);

  const geometry = createMeshGeometry({
    indices: indexArray,
    layout: CANONICAL_VERTEX_LAYOUT,
    vertices: vertices,
  });

  computeMeshGeometryTangents(geometry, geometry);

  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, geometry);
  geometry.bounds = bounds;

  return geometry;
}

const CANONICAL_FLOATS_PER_VERTEX = 12;

// The canonical interleaved PBR vertex layout shared by every builder: position + normal +
// tangent(w = handedness) + uv0, stride 48 bytes.
const CANONICAL_VERTEX_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// Tetrahedron: 4 vertices, 4 triangular faces.
const TETRAHEDRON_VERTS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, -1, -1],
];
const TETRAHEDRON_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [2, 1, 0],
  [0, 3, 2],
  [1, 3, 0],
  [2, 3, 1],
];

// Octahedron: 6 vertices, 8 triangular faces.
const OCTAHEDRON_VERTS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const OCTAHEDRON_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 2, 4],
  [0, 4, 3],
  [0, 3, 5],
  [0, 5, 2],
  [1, 4, 2],
  [1, 3, 4],
  [1, 5, 3],
  [1, 2, 5],
];

// Icosahedron: 12 vertices, 20 triangular faces.
const _phi = (1 + Math.sqrt(5)) * 0.5;
const ICOSAHEDRON_VERTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, _phi, 0],
  [1, _phi, 0],
  [-1, -_phi, 0],
  [1, -_phi, 0],
  [0, -1, _phi],
  [0, 1, _phi],
  [0, -1, -_phi],
  [0, 1, -_phi],
  [_phi, 0, -1],
  [_phi, 0, 1],
  [-_phi, 0, -1],
  [-_phi, 0, 1],
];
const ICOSAHEDRON_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

// Dodecahedron: 20 vertices, 12 pentagonal faces (each pentagon triangulated into 3 triangles).
// Vertex positions adapted from three.js DodecahedronGeometry (MIT). Each pentagon is split
// into 3 triangles by fanning from the first vertex. 12 faces × 3 = 36 triangles.
const _d = 1 / _phi;
const DODECAHEDRON_VERTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
  [0, -_d, -_phi],
  [0, -_d, _phi],
  [0, _d, -_phi],
  [0, _d, _phi],
  [-_d, -_phi, 0],
  [-_d, _phi, 0],
  [_d, -_phi, 0],
  [_d, _phi, 0],
  [-_phi, 0, -_d],
  [-_phi, 0, _d],
  [_phi, 0, -_d],
  [_phi, 0, _d],
];
const DODECAHEDRON_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [3, 11, 7],
  [3, 7, 15],
  [3, 15, 13],
  [7, 19, 11],
  [7, 11, 9],
  [7, 9, 19],
  [15, 7, 19],
  [15, 19, 18],
  [15, 18, 6],
  [13, 15, 6],
  [13, 6, 2],
  [13, 2, 16],
  [3, 13, 16],
  [3, 16, 17],
  [3, 17, 11],
  [11, 17, 1],
  [11, 1, 9],
  [9, 1, 5],
  [5, 1, 17],
  [5, 17, 4],
  [5, 4, 14],
  [9, 5, 14],
  [9, 14, 12],
  [9, 12, 0],
  [1, 0, 12],
  [1, 12, 4],
  [1, 4, 17],
  [6, 18, 8],
  [6, 8, 10],
  [6, 10, 2],
  [18, 19, 8],
  [19, 7, 8],
  [7, 15, 8],
  [2, 10, 16],
  [10, 8, 0],
  [0, 8, 12],
];
