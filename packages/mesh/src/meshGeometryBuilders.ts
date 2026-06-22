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
      indices.push(a, c, b, b, c, d);
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
