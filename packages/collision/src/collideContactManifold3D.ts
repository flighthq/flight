import type { CollisionContactManifold3D, CollisionShape3D } from '@flighthq/types/contract';
import { MAX_COLLISION_CONTACT_POINTS_3D } from '@flighthq/types/contract';

import { getCollisionFaceQuery3D } from './collisionFace3D';
import { getCollisionSupport3D } from './collisionSupport3D';
import { clearCollisionContactManifold3D } from './contactManifold3D';
import { createCollisionManifold3D } from './manifold3D';
import { testCollision3D } from './testCollision3D';

// The 3D contact lane: `testCollision3D`'s manifold-producing twin. Returns whether the pair overlaps
// and, when it does, writes the shared normal pushing **A out of B** plus the world-space points the
// two surfaces meet at.
//
// The normal and depth come from the same place `testCollision3D` gets them, so the two entry points
// can never disagree about whether a pair touches. What this adds is the POINTS, and they come from
// clipping one shape's supporting face against the other's — the shape-aware step the generic core
// cannot do, because a support function hides face topology by construction.
//
// **Argument order**, with the same caveat the 2D twin carries: overlap, normal, and depth are
// order-invariant, but for two shapes of the same kind meeting face to face the tie over which face is
// the reference resolves toward the first argument, and the points then lie on that shape's surface.
// Reversing the arguments moves them to the other surface, one depth away, and renumbers their ids.
// A caller keying a warm-start cache on feature identity must pass each pair in a STABLE order of its
// own, derived from persistent identity rather than geometry — `@flighthq/physics3d` orders every pair
// by body index before it calls.
//
// Falls back to ONE point at the midpoint of the two surfaces when either shape has no face along the
// contact direction. That is the honest answer for a sphere, which touches at a point; it is also why
// a sphere resting on a floor is stable with one point while a box needs four.
export function collideContactManifold3D(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  out: CollisionContactManifold3D,
): boolean {
  if (!testCollision3D(a, b, scratchManifold)) {
    clearCollisionContactManifold3D(out);
    return false;
  }
  const normalX = scratchManifold.normalX;
  const normalY = scratchManifold.normalY;
  const normalZ = scratchManifold.normalZ;
  const depth = scratchManifold.depth;

  out.overlapping = true;
  out.normalX = normalX;
  out.normalY = normalY;
  out.normalZ = normalZ;
  out.pointCount = 0;

  // A's contacting surface faces toward B, which is the direction the normal pushes A away from.
  const faceQueryA = getCollisionFaceQuery3D(a.kind);
  const faceQueryB = getCollisionFaceQuery3D(b.kind);
  const countA = faceQueryA === null ? 0 : faceQueryA(a, -normalX, -normalY, -normalZ, faceA);
  const countB = faceQueryB === null ? 0 : faceQueryB(b, normalX, normalY, normalZ, faceB);

  if (countA < 2 || countB < 2) {
    writeSingleContactPoint(a, b, normalX, normalY, normalZ, depth, out);
    return true;
  }

  // The REFERENCE face is the one whose plane the contact is measured against, and it must be the
  // flatter-facing of the two: clipping the incident polygon against the reference's side planes is
  // only meaningful when the reference genuinely faces along the contact normal. Choosing by which
  // face is more perpendicular to the normal is what stops a glancing edge from acting as a floor.
  const referenceIsA =
    countA >= 3 &&
    (countB < 3 ||
      faceAlignment(faceA, countA, normalX, normalY, normalZ) >=
        faceAlignment(faceB, countB, normalX, normalY, normalZ));
  const reference = referenceIsA ? faceA : faceB;
  const referenceCount = referenceIsA ? countA : countB;
  const incident = referenceIsA ? faceB : faceA;
  const incidentCount = referenceIsA ? countB : countA;
  // The reference plane's outward normal points from the reference shape toward the other one.
  const planeX = referenceIsA ? -normalX : normalX;
  const planeY = referenceIsA ? -normalY : normalY;
  const planeZ = referenceIsA ? -normalZ : normalZ;

  const clippedCount = clipIncidentAgainstReference(
    reference,
    referenceCount,
    incident,
    incidentCount,
    planeX,
    planeY,
    planeZ,
  );
  if (clippedCount === 0) {
    writeSingleContactPoint(a, b, normalX, normalY, normalZ, depth, out);
    return true;
  }

  const planeOffset = reference[0] * planeX + reference[1] * planeY + reference[2] * planeZ;
  for (let i = 0; i < clippedCount && out.pointCount < MAX_COLLISION_CONTACT_POINTS_3D; i += 1) {
    const x = clipped[i * 3];
    const y = clipped[i * 3 + 1];
    const z = clipped[i * 3 + 2];
    // How far this point sits BELOW the reference plane. A point that has floated above it is not in
    // contact and is dropped rather than reported with a negative depth a solver would push apart.
    const separation = planeOffset - (x * planeX + y * planeY + z * planeZ);
    if (separation < 0) continue;
    const point = out.points[out.pointCount];
    point.x = x;
    point.y = y;
    point.z = z;
    point.depth = separation;
    point.featureId = packContactFeatureId3D(referenceIsA, i);
    out.pointCount += 1;
  }

  if (out.pointCount === 0) writeSingleContactPoint(a, b, normalX, normalY, normalZ, depth, out);
  return true;
}

// Clips the incident polygon against the reference face's side planes — the Sutherland-Hodgman
// sequence, one plane per reference edge. Each side plane is perpendicular to the reference face and
// faces outward from it, so what survives is the part of the incident face lying within the reference
// face's silhouette. Returns how many vertices survived, in `clipped`.
//
// EACH SIDE PLANE IS ORIENTED AGAINST THE REFERENCE FACE'S OWN CENTROID rather than by assuming a
// winding. `edge x planeNormal` is perpendicular to both, but WHICH of the two opposite perpendiculars
// it lands on depends on the order the face's vertices happen to arrive in — and the face queries do
// not share one: a box's corners come from a local-axis walk, a convex hull's from an angular sort
// whose zero depends on which cardinal axis the normal was least aligned with. Assume a winding and
// half the faces clip away their own interior, leaving nothing and silently demoting a resting box to
// the single-point fallback, which is a box that rocks rather than rests. The centroid is unambiguous:
// the outward normal is the one pointing away from it.
function clipIncidentAgainstReference(
  reference: Readonly<number[]>,
  referenceCount: number,
  incident: Readonly<number[]>,
  incidentCount: number,
  planeX: number,
  planeY: number,
  planeZ: number,
): number {
  let count = incidentCount;
  for (let i = 0; i < incidentCount * 3; i += 1) clipped[i] = incident[i];

  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;
  for (let i = 0; i < referenceCount; i += 1) {
    centroidX += reference[i * 3];
    centroidY += reference[i * 3 + 1];
    centroidZ += reference[i * 3 + 2];
  }
  centroidX /= referenceCount;
  centroidY /= referenceCount;
  centroidZ /= referenceCount;

  for (let edge = 0; edge < referenceCount && count > 0; edge += 1) {
    const nextEdge = (edge + 1) % referenceCount;
    const originX = reference[edge * 3];
    const originY = reference[edge * 3 + 1];
    const originZ = reference[edge * 3 + 2];
    const edgeX = reference[nextEdge * 3] - originX;
    const edgeY = reference[nextEdge * 3 + 1] - originY;
    const edgeZ = reference[nextEdge * 3 + 2] - originZ;
    let sideX = edgeY * planeZ - edgeZ * planeY;
    let sideY = edgeZ * planeX - edgeX * planeZ;
    let sideZ = edgeX * planeY - edgeY * planeX;
    const length = Math.sqrt(sideX * sideX + sideY * sideY + sideZ * sideZ);
    if (length <= CLIP_EPSILON) continue;
    sideX /= length;
    sideY /= length;
    sideZ /= length;
    if (sideX * (centroidX - originX) + sideY * (centroidY - originY) + sideZ * (centroidZ - originZ) > 0) {
      sideX = -sideX;
      sideY = -sideY;
      sideZ = -sideZ;
    }
    count = clipAgainstPlane(count, sideX, sideY, sideZ, originX * sideX + originY * sideY + originZ * sideZ);
  }
  return count;
}

// One Sutherland-Hodgman pass: keeps the part of the polygon on the inner side of a plane, inserting
// the crossing point wherever an edge spans it. Reads `clipped` and writes it back through a scratch
// buffer, so the caller sees only the result.
function clipAgainstPlane(count: number, planeX: number, planeY: number, planeZ: number, offset: number): number {
  let written = 0;
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    const currentX = clipped[i * 3];
    const currentY = clipped[i * 3 + 1];
    const currentZ = clipped[i * 3 + 2];
    const nextX = clipped[next * 3];
    const nextY = clipped[next * 3 + 1];
    const nextZ = clipped[next * 3 + 2];
    const currentDistance = currentX * planeX + currentY * planeY + currentZ * planeZ - offset;
    const nextDistance = nextX * planeX + nextY * planeY + nextZ * planeZ - offset;

    if (currentDistance <= CLIP_TOLERANCE) {
      if (written >= MAX_CLIPPED_VERTICES) break;
      clipScratch[written * 3] = currentX;
      clipScratch[written * 3 + 1] = currentY;
      clipScratch[written * 3 + 2] = currentZ;
      written += 1;
    }
    // Only a genuine sign change produces a crossing. Testing the product would also fire when one end
    // sits exactly on the plane, duplicating a vertex already written.
    if (
      (currentDistance > CLIP_TOLERANCE && nextDistance < -CLIP_TOLERANCE) ||
      (currentDistance < -CLIP_TOLERANCE && nextDistance > CLIP_TOLERANCE)
    ) {
      if (written >= MAX_CLIPPED_VERTICES) break;
      const t = currentDistance / (currentDistance - nextDistance);
      clipScratch[written * 3] = currentX + (nextX - currentX) * t;
      clipScratch[written * 3 + 1] = currentY + (nextY - currentY) * t;
      clipScratch[written * 3 + 2] = currentZ + (nextZ - currentZ) * t;
      written += 1;
    }
  }
  for (let i = 0; i < written * 3; i += 1) clipped[i] = clipScratch[i];
  return written;
}

// How squarely a face faces along the contact normal, as the absolute cosine between the two. Used to
// pick the reference face; 1 is a face exactly perpendicular to the normal.
function faceAlignment(
  face: Readonly<number[]>,
  count: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): number {
  if (count < 3) return 0;
  const abX = face[3] - face[0];
  const abY = face[4] - face[1];
  const abZ = face[5] - face[2];
  const acX = face[6] - face[0];
  const acY = face[7] - face[1];
  const acZ = face[8] - face[2];
  const faceNormalX = abY * acZ - abZ * acY;
  const faceNormalY = abZ * acX - abX * acZ;
  const faceNormalZ = abX * acY - abY * acX;
  const length = Math.sqrt(faceNormalX * faceNormalX + faceNormalY * faceNormalY + faceNormalZ * faceNormalZ);
  if (length <= CLIP_EPSILON) return 0;
  return Math.abs((faceNormalX * normalX + faceNormalY * normalY + faceNormalZ * normalZ) / length);
}

// Packs which shape owned the reference face and which clipped slot this point is into one opaque id.
//
// Positional multiplication rather than bit shifts, for the reason the 2D packing records: `<<`
// truncates to 32 bits, so a shift-packed id wraps silently once a field outgrows its width and two
// unrelated features collide on one number — which surfaces as a solver warm-starting a contact with
// an impulse belonging somewhere else, and as jitter no stack trace explains.
function packContactFeatureId3D(referenceIsA: boolean, slot: number): number {
  return (referenceIsA ? MAX_COLLISION_CONTACT_POINTS_3D : 0) + slot;
}

// Writes the single-point fallback: the midpoint of the two shapes' surfaces along the contact normal.
// Used when either shape is curved along the contact direction, and when clipping leaves nothing.
function writeSingleContactPoint(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  normalX: number,
  normalY: number,
  normalZ: number,
  depth: number,
  out: CollisionContactManifold3D,
): void {
  const supportA = getCollisionSupport3D(a.kind);
  const supportB = getCollisionSupport3D(b.kind);
  if (supportA === null || supportB === null) {
    out.pointCount = 0;
    return;
  }
  supportA(a, -normalX, -normalY, -normalZ, surfaceA);
  supportB(b, normalX, normalY, normalZ, surfaceB);
  const point = out.points[0];
  point.x = (surfaceA[0] + surfaceB[0]) / 2;
  point.y = (surfaceA[1] + surfaceB[1]) / 2;
  point.z = (surfaceA[2] + surfaceB[2]) / 2;
  point.depth = depth;
  point.featureId = 0;
  out.pointCount = 1;
}

// How far outside a clip plane a vertex may sit and still be kept. A face resting exactly on another
// puts every vertex on the plane, where floating-point noise decides the sign; a hard zero there drops
// corners of a squarely-resting box at random and leaves it rocking on two points.
const CLIP_TOLERANCE = 1e-9;
const CLIP_EPSILON = 1e-12;
const MAX_CLIPPED_VERTICES = 32;

const clipScratch = new Float64Array(MAX_CLIPPED_VERTICES * 3);
const clipped = new Float64Array(MAX_CLIPPED_VERTICES * 3);
const faceA: number[] = [];
const faceB: number[] = [];
const scratchManifold = createCollisionManifold3D();
const surfaceA = [0, 0, 0];
const surfaceB = [0, 0, 0];
