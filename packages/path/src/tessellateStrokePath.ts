import type { Path, PathMesh, StrokeStyle } from '@flighthq/types/contract';

import { buildStrokePathGeometry, StrokePathTessellationIssueNone } from './strokePathGeometry';

// Builds a non-overlapping triangle mesh directly from stroke cross-sections. Unlike tessellating the
// outline as a fill, this represents a closed stroke's hollow ring without asking the generic path-fill
// tessellator to understand holes. Null means the centerline or its offset outline is pathological; the
// renderer can preserve Canvas semantics through its raster fallback.
export function tessellateStrokePath(
  path: Readonly<Path>,
  style: Readonly<StrokeStyle>,
  tolerance = 0.25,
): PathMesh | null {
  const geometry = buildStrokePathGeometry(path, style, tolerance);
  if (geometry.issue !== StrokePathTessellationIssueNone) return null;
  const mesh: PathMesh = { indices: [], vertices: [] };
  for (let i = 0; i < geometry.pieces.length; i++) appendStrokePieceMesh(mesh, geometry.pieces[i]);
  return mesh;
}

function appendStrokePieceMesh(
  mesh: PathMesh,
  piece: Readonly<{
    closed: boolean;
    endCap: readonly number[];
    left: readonly number[];
    right: readonly number[];
    startCap: readonly number[];
  }>,
): void {
  const sectionCount = piece.left.length >> 1;
  if (sectionCount < 2) return;
  const base = mesh.vertices.length >> 1;
  for (let i = 0; i < sectionCount; i++) {
    mesh.vertices.push(piece.left[i * 2], piece.left[i * 2 + 1], piece.right[i * 2], piece.right[i * 2 + 1]);
  }
  const connectionCount = piece.closed ? sectionCount : sectionCount - 1;
  for (let i = 0; i < connectionCount; i++) {
    const next = (i + 1) % sectionCount;
    const left = base + i * 2;
    const right = left + 1;
    const nextLeft = base + next * 2;
    const nextRight = nextLeft + 1;
    appendTriangle(mesh, left, right, nextLeft);
    appendTriangle(mesh, nextLeft, right, nextRight);
  }
  if (!piece.closed && piece.startCap.length > 0) {
    const right = [piece.right[0], piece.right[1]];
    const left = [piece.left[0], piece.left[1]];
    appendRoundCap(mesh, right, piece.startCap, left);
  }
  if (!piece.closed && piece.endCap.length > 0) {
    const end = piece.left.length - 2;
    const left = [piece.left[end], piece.left[end + 1]];
    const right = [piece.right[end], piece.right[end + 1]];
    appendRoundCap(mesh, left, piece.endCap, right);
  }
}

function appendRoundCap(
  mesh: PathMesh,
  start: readonly [number, number] | readonly number[],
  interior: readonly number[],
  end: readonly [number, number] | readonly number[],
): void {
  const center = mesh.vertices.length >> 1;
  mesh.vertices.push((start[0] + end[0]) / 2, (start[1] + end[1]) / 2);
  const arcBase = mesh.vertices.length >> 1;
  mesh.vertices.push(start[0], start[1], ...interior, end[0], end[1]);
  const arcCount = (interior.length >> 1) + 2;
  for (let i = 0; i < arcCount - 1; i++) appendTriangle(mesh, center, arcBase + i, arcBase + i + 1);
}

function appendTriangle(mesh: PathMesh, a: number, b: number, c: number): void {
  const ax = mesh.vertices[a * 2];
  const ay = mesh.vertices[a * 2 + 1];
  const bx = mesh.vertices[b * 2];
  const by = mesh.vertices[b * 2 + 1];
  const cx = mesh.vertices[c * 2];
  const cy = mesh.vertices[c * 2 + 1];
  if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) <= TRIANGLE_EPSILON) return;
  mesh.indices.push(a, b, c);
}

const TRIANGLE_EPSILON = 1e-10;
