// Generated from crates/flight-path/src/tessellate_stroke_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathMesh, PathRaw, StrokeStyle } from './path.ts';
import type { StrokePathPieceGeometry } from './strokePathGeometry.ts';
import { buildStrokePathGeometry } from './strokePathGeometry.ts';

const TRIANGLE_EPSILON: number = 1e-10;

function appendRoundCap(
  mesh: PathMesh,
  start: Readonly<number[]>,
  interior: Readonly<number[]>,
  end: Readonly<number[]>,
): void {
  const center = Math.trunc(mesh.vertices.length / 2) >>> 0;
  mesh.vertices.push((start[0] + end[0]) / 2.0);
  mesh.vertices.push((start[1] + end[1]) / 2.0);
  const arcBase = Math.trunc(mesh.vertices.length / 2) >>> 0;
  mesh.vertices.push(start[0]);
  mesh.vertices.push(start[1]);
  for (let i = 0; i < interior.length; i += 1) {
    mesh.vertices.push(interior[i]);
  }
  mesh.vertices.push(end[0]);
  mesh.vertices.push(end[1]);
  const arcCount = Math.trunc(interior.length / 2) + 2;
  for (let i = 0; i < arcCount - 1; i += 1) {
    appendTriangle(mesh, center, arcBase + (i >>> 0), arcBase + (i >>> 0) + 1);
  }
}

function appendStrokePieceMesh(mesh: PathMesh, piece: Readonly<StrokePathPieceGeometry>): void {
  const sectionCount = Math.trunc(piece.left.length / 2);
  if (sectionCount < 2) {
    return;
  }
  const base = Math.trunc(mesh.vertices.length / 2) >>> 0;
  for (let i = 0; i < sectionCount; i += 1) {
    mesh.vertices.push(piece.left[i * 2]);
    mesh.vertices.push(piece.left[i * 2 + 1]);
    mesh.vertices.push(piece.right[i * 2]);
    mesh.vertices.push(piece.right[i * 2 + 1]);
  }
  const connectionCount = piece.closed ? sectionCount : sectionCount - 1;
  for (let i = 0; i < connectionCount; i += 1) {
    const next = ((i + 1) % sectionCount) >>> 0;
    const left = base + (i >>> 0) * 2;
    const right = left + 1;
    const nextLeft = base + next * 2;
    const nextRight = nextLeft + 1;
    appendTriangle(mesh, left, right, nextLeft);
    appendTriangle(mesh, nextLeft, right, nextRight);
  }
  if (!piece.closed && piece.startCap.length !== 0) {
    const right = [piece.right[0], piece.right[1]];
    const left = [piece.left[0], piece.left[1]];
    appendRoundCap(mesh, right, piece.startCap, left);
  }
  if (!piece.closed && piece.endCap.length !== 0) {
    const end = piece.left.length - 2;
    const left = [piece.left[end], piece.left[end + 1]];
    const right = [piece.right[end], piece.right[end + 1]];
    appendRoundCap(mesh, left, piece.endCap, right);
  }
}

function appendTriangle(mesh: PathMesh, a: number, b: number, c: number): void {
  const ax = mesh.vertices[a * 2];
  const ay = mesh.vertices[a * 2 + 1];
  const bx = mesh.vertices[b * 2];
  const by = mesh.vertices[b * 2 + 1];
  const cx = mesh.vertices[c * 2];
  const cy = mesh.vertices[c * 2 + 1];
  if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) <= TRIANGLE_EPSILON) {
    return;
  }
  mesh.indices.push(a);
  mesh.indices.push(b);
  mesh.indices.push(c);
}

/**
 * Builds a non-overlapping triangle mesh directly from stroke cross-sections.
 * Returns `undefined` if the centerline or its offset outline is pathological.
 */
export function tessellateStrokePath(
  path: Readonly<PathRaw>,
  style: Readonly<StrokeStyle>,
  tolerance?: number,
): PathMesh | null {
  tolerance = tolerance ?? 0.25;
  const geometry = buildStrokePathGeometry(path, style, tolerance);
  if (geometry.issue !== 'ok') {
    return null;
  }
  let mesh: PathMesh = { vertices: [], indices: [] };
  for (let i = 0; i < geometry.pieces.length; i += 1) {
    appendStrokePieceMesh(mesh, geometry.pieces[i]);
  }
  if (mesh.vertices.length === 0) {
    return null;
  }
  return mesh;
}
