import type {
  CollisionAabb3D,
  CollisionBuiltInShape3D,
  CollisionContactManifold3D,
  CollisionHeightfield3D,
  CollisionRaycastHit3D,
  CollisionShape3D,
  CollisionTestStatus,
  CollisionTimeOfImpact3D,
  CollisionTriangleMesh3D,
} from '@flighthq/types/contract';

import { collideContactManifold3D } from './collideContactManifold3D';
import { getCollisionSupport3D } from './collisionSupport3D';
import { clearCollisionContactManifold3D, createCollisionContactManifold3D } from './contactManifold3D';
import { createCollisionTimeOfImpact3D, sweepCollisionShape3D } from './sweepCollisionShape3D';

// Tests one convex shape against a static heightfield through the heightfield's retained triangle-mesh
// acceleration. The normal always pushes the convex first argument out of the surface.
export function collideCollisionHeightfield3D(
  convex: Readonly<CollisionShape3D>,
  heightfield: Readonly<CollisionHeightfield3D>,
  out: CollisionContactManifold3D,
): boolean {
  if (getCollisionHeightfieldValidationStatus3D(heightfield) !== null) {
    clearCollisionContactManifold3D(out);
    return false;
  }
  return collideCollisionTriangleMesh3D(convex, getCollisionHeightfieldTriangleMesh3D(heightfield), out);
}

// Tests one convex shape against candidate triangles selected from a retained local-space BVH. The
// several triangle manifolds are reduced to one stable, spatially distributed four-point patch so a
// box resting across a mesh seam does not become two competing physics contacts.
export function collideCollisionTriangleMesh3D(
  convex: Readonly<CollisionShape3D>,
  mesh: Readonly<CollisionTriangleMesh3D>,
  out: CollisionContactManifold3D,
): boolean {
  clearCollisionContactManifold3D(out);
  const support = getCollisionSupport3D(convex.kind);
  if (support === null || getCollisionTriangleMeshValidationStatus3D(mesh) !== null) return false;

  writeCollisionShapeBounds3D(convex, support, scratchBounds);
  writeWorldBoundsInCollisionTriangleMeshLocal3D(mesh, scratchBounds, scratchLocalBounds);
  queryCollisionTriangleMeshCandidates3D(mesh, scratchLocalBounds, scratchTriangles);

  scratchContactCandidates.length = 0;
  let bestDepth = -Infinity;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let bestNormalZ = 0;
  for (const triangle of scratchTriangles) {
    writeCollisionTriangleMeshTriangleWorld3D(mesh, triangle, scratchTriangle.points);
    if (!collideContactManifold3D(convex, scratchTriangle, scratchManifold)) continue;
    const depth = getCollisionContactManifoldDepth3D(scratchManifold);
    const alignment =
      scratchManifold.normalX * bestNormalX +
      scratchManifold.normalY * bestNormalY +
      scratchManifold.normalZ * bestNormalZ;
    if (
      bestDepth === -Infinity ||
      (depth > bestDepth + CONTACT_DEPTH_EPSILON && alignment < CONTACT_NORMAL_ALIGNMENT)
    ) {
      bestDepth = depth;
      bestNormalX = scratchManifold.normalX;
      bestNormalY = scratchManifold.normalY;
      bestNormalZ = scratchManifold.normalZ;
      scratchContactCandidates.length = 0;
    }
    const selectedAlignment =
      scratchManifold.normalX * bestNormalX +
      scratchManifold.normalY * bestNormalY +
      scratchManifold.normalZ * bestNormalZ;
    if (selectedAlignment < CONTACT_NORMAL_ALIGNMENT) continue;
    if (depth > bestDepth) bestDepth = depth;
    for (let i = 0; i < scratchManifold.pointCount; i += 1) {
      const point = scratchManifold.points[i];
      appendCollisionTriangleContactCandidate3D(point.x, point.y, point.z, point.depth, triangle * 4 + i);
    }
  }

  if (bestDepth === -Infinity) return false;
  out.overlapping = true;
  out.normalX = bestNormalX;
  out.normalY = bestNormalY;
  out.normalZ = bestNormalZ;
  writeReducedCollisionTriangleContactCandidates3D(out);
  return true;
}

// Allocates a heightfield descriptor with an identity pose. The height payload is copied so its
// ownership is unambiguous; edit the returned array and invalidate the descriptor when terrain changes.
export function createCollisionHeightfield3D(
  columns: number,
  rows: number,
  heights: readonly number[],
  cellSizeX = 1,
  cellSizeZ = 1,
): CollisionHeightfield3D {
  return {
    kind: 'heightfield',
    columns,
    rows,
    heights: heights.slice(),
    cellSizeX,
    cellSizeZ,
    version: 0,
    x: 0,
    y: 0,
    z: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    rotationW: 1,
  };
}

// Allocates a triangle-mesh descriptor with an identity pose. Points and indices are copied; callers
// may release their source arrays immediately.
export function createCollisionTriangleMesh3D(
  points: readonly number[],
  indices: readonly number[],
): CollisionTriangleMesh3D {
  return {
    kind: 'triangle-mesh',
    points: points.slice(),
    indices: indices.slice(),
    version: 0,
    x: 0,
    y: 0,
    z: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    rotationW: 1,
  };
}

export function getCollisionHeightfieldValidationStatus3D(
  heightfield: Readonly<CollisionHeightfield3D>,
): CollisionTestStatus | null {
  if (
    !Number.isSafeInteger(heightfield.columns) ||
    !Number.isSafeInteger(heightfield.rows) ||
    heightfield.columns < 2 ||
    heightfield.rows < 2 ||
    heightfield.heights.length !== heightfield.columns * heightfield.rows ||
    !Number.isFinite(heightfield.cellSizeX) ||
    !Number.isFinite(heightfield.cellSizeZ) ||
    heightfield.cellSizeX <= 0 ||
    heightfield.cellSizeZ <= 0 ||
    !Number.isSafeInteger(heightfield.version) ||
    heightfield.version < 0 ||
    !isCollisionTriangleSurfacePoseValid3D(heightfield)
  ) {
    return 'degenerate-shape';
  }
  const cached = collisionHeightfieldValidations3D.get(heightfield);
  if (
    cached !== undefined &&
    cached.heights === heightfield.heights &&
    cached.columns === heightfield.columns &&
    cached.rows === heightfield.rows &&
    cached.version === heightfield.version
  ) {
    return cached.status;
  }
  let status: CollisionTestStatus | null = null;
  for (const height of heightfield.heights) {
    if (!Number.isFinite(height)) {
      status = 'degenerate-shape';
      break;
    }
  }
  collisionHeightfieldValidations3D.set(heightfield, {
    heights: heightfield.heights,
    columns: heightfield.columns,
    rows: heightfield.rows,
    version: heightfield.version,
    status,
  });
  return status;
}

export function getCollisionTriangleMeshValidationStatus3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
): CollisionTestStatus | null {
  if (
    mesh.points.length < 9 ||
    mesh.points.length % 3 !== 0 ||
    mesh.indices.length < 3 ||
    mesh.indices.length % 3 !== 0 ||
    !Number.isSafeInteger(mesh.version) ||
    mesh.version < 0 ||
    !isCollisionTriangleSurfacePoseValid3D(mesh)
  ) {
    return 'degenerate-shape';
  }
  const cached = collisionTriangleMeshValidations3D.get(mesh);
  if (
    cached !== undefined &&
    cached.points === mesh.points &&
    cached.indices === mesh.indices &&
    cached.version === mesh.version
  ) {
    return cached.status;
  }
  let status: CollisionTestStatus | null = null;
  for (const value of mesh.points) {
    if (!Number.isFinite(value)) {
      status = 'degenerate-shape';
      break;
    }
  }
  const vertexCount = mesh.points.length / 3;
  if (status === null) {
    for (const index of mesh.indices) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
        status = 'degenerate-shape';
        break;
      }
    }
  }
  if (status === null) {
    for (let triangle = 0; triangle < mesh.indices.length / 3; triangle += 1) {
      if (!isCollisionTriangleMeshTriangleValid3D(mesh, triangle)) {
        status = 'degenerate-shape';
        break;
      }
    }
  }
  collisionTriangleMeshValidations3D.set(mesh, {
    points: mesh.points,
    indices: mesh.indices,
    version: mesh.version,
    status,
  });
  return status;
}

// Marks in-place height edits. The retained implicit mesh and its BVH rebuild at the next query.
export function invalidateCollisionHeightfield3D(heightfield: CollisionHeightfield3D): void {
  heightfield.version += 1;
}

// Marks in-place point/index edits. The local-space BVH rebuilds at the next query.
export function invalidateCollisionTriangleMesh3D(mesh: CollisionTriangleMesh3D): void {
  mesh.version += 1;
}

export function raycastCollisionHeightfield3D(
  heightfield: Readonly<CollisionHeightfield3D>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction = Infinity,
): boolean {
  if (getCollisionHeightfieldValidationStatus3D(heightfield) !== null) return false;
  return raycastCollisionTriangleMesh3D(
    getCollisionHeightfieldTriangleMesh3D(heightfield),
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    out,
    maxFraction,
  );
}

export function raycastCollisionTriangleMesh3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction = Infinity,
): boolean {
  if (getCollisionTriangleMeshValidationStatus3D(mesh) !== null || maxFraction < 0) return false;
  writeCollisionTriangleMeshLocalPoint3D(mesh, originX, originY, originZ, scratchLocalOrigin);
  writeCollisionTriangleMeshLocalDirection3D(mesh, directionX, directionY, directionZ, scratchLocalDirection);
  const cache = getCollisionTriangleMeshAcceleration3D(mesh);
  let fraction = maxFraction;
  let triangleHit = -1;
  scratchNodeStack.length = 0;
  if (cache.nodes.length > 0) scratchNodeStack.push(0);
  while (scratchNodeStack.length > 0) {
    const nodeIndex = scratchNodeStack.pop();
    if (nodeIndex === undefined) break;
    const node = cache.nodes[nodeIndex];
    if (
      !raycastCollisionBoundsLocal3D(
        node,
        scratchLocalOrigin[0],
        scratchLocalOrigin[1],
        scratchLocalOrigin[2],
        scratchLocalDirection[0],
        scratchLocalDirection[1],
        scratchLocalDirection[2],
        fraction,
      )
    ) {
      continue;
    }
    if (node.count === 0) {
      if (node.right >= 0) scratchNodeStack.push(node.right);
      if (node.left >= 0) scratchNodeStack.push(node.left);
      continue;
    }
    for (let i = node.start; i < node.start + node.count; i += 1) {
      const triangle = cache.order[i];
      if (
        !raycastCollisionTriangleLocal3D(
          mesh,
          triangle,
          scratchLocalOrigin[0],
          scratchLocalOrigin[1],
          scratchLocalOrigin[2],
          scratchLocalDirection[0],
          scratchLocalDirection[1],
          scratchLocalDirection[2],
          scratchRay,
          fraction,
        )
      ) {
        continue;
      }
      fraction = scratchRay[0];
      triangleHit = triangle;
    }
  }
  if (triangleHit < 0) return false;

  writeCollisionTriangleMeshTriangleNormalLocal3D(mesh, triangleHit, scratchNormal);
  if (
    scratchNormal[0] * scratchLocalDirection[0] +
      scratchNormal[1] * scratchLocalDirection[1] +
      scratchNormal[2] * scratchLocalDirection[2] >
    0
  ) {
    scratchNormal[0] = -scratchNormal[0];
    scratchNormal[1] = -scratchNormal[1];
    scratchNormal[2] = -scratchNormal[2];
  }
  writeCollisionTriangleMeshWorldDirection3D(
    mesh,
    scratchNormal[0],
    scratchNormal[1],
    scratchNormal[2],
    scratchWorldNormal,
  );
  out.fraction = fraction;
  out.x = originX + directionX * fraction;
  out.y = originY + directionY * fraction;
  out.z = originZ + directionZ * fraction;
  out.normalX = scratchWorldNormal[0];
  out.normalY = scratchWorldNormal[1];
  out.normalZ = scratchWorldNormal[2];
  return true;
}

export function sweepCollisionHeightfield3D(
  convex: Readonly<CollisionShape3D>,
  deltaX: number,
  deltaY: number,
  deltaZ: number,
  heightfield: Readonly<CollisionHeightfield3D>,
  out: CollisionTimeOfImpact3D,
  maxFraction = 1,
): boolean {
  if (getCollisionHeightfieldValidationStatus3D(heightfield) !== null) return false;
  return sweepCollisionTriangleMesh3D(
    convex,
    deltaX,
    deltaY,
    deltaZ,
    getCollisionHeightfieldTriangleMesh3D(heightfield),
    out,
    maxFraction,
  );
}

export function sweepCollisionTriangleMesh3D(
  convex: Readonly<CollisionShape3D>,
  deltaX: number,
  deltaY: number,
  deltaZ: number,
  mesh: Readonly<CollisionTriangleMesh3D>,
  out: CollisionTimeOfImpact3D,
  maxFraction = 1,
): boolean {
  const support = getCollisionSupport3D(convex.kind);
  if (support === null || getCollisionTriangleMeshValidationStatus3D(mesh) !== null) return false;
  writeCollisionShapeBounds3D(convex, support, scratchBounds);
  scratchBounds.minX = Math.min(scratchBounds.minX, scratchBounds.minX + deltaX * maxFraction);
  scratchBounds.minY = Math.min(scratchBounds.minY, scratchBounds.minY + deltaY * maxFraction);
  scratchBounds.minZ = Math.min(scratchBounds.minZ, scratchBounds.minZ + deltaZ * maxFraction);
  scratchBounds.maxX = Math.max(scratchBounds.maxX, scratchBounds.maxX + deltaX * maxFraction);
  scratchBounds.maxY = Math.max(scratchBounds.maxY, scratchBounds.maxY + deltaY * maxFraction);
  scratchBounds.maxZ = Math.max(scratchBounds.maxZ, scratchBounds.maxZ + deltaZ * maxFraction);
  writeWorldBoundsInCollisionTriangleMeshLocal3D(mesh, scratchBounds, scratchLocalBounds);
  queryCollisionTriangleMeshCandidates3D(mesh, scratchLocalBounds, scratchTriangles);

  let fraction = maxFraction;
  let hit = false;
  for (const triangle of scratchTriangles) {
    writeCollisionTriangleMeshTriangleWorld3D(mesh, triangle, scratchTriangle.points);
    if (
      !sweepCollisionShape3D(convex, deltaX, deltaY, deltaZ, scratchTriangle, 0, 0, 0, scratchTimeOfImpact, fraction)
    ) {
      continue;
    }
    fraction = scratchTimeOfImpact.fraction;
    out.fraction = scratchTimeOfImpact.fraction;
    out.x = scratchTimeOfImpact.x;
    out.y = scratchTimeOfImpact.y;
    out.z = scratchTimeOfImpact.z;
    out.normalX = scratchTimeOfImpact.normalX;
    out.normalY = scratchTimeOfImpact.normalY;
    out.normalZ = scratchTimeOfImpact.normalZ;
    hit = true;
  }
  return hit;
}

export function writeCollisionHeightfieldBounds3D(
  heightfield: Readonly<CollisionHeightfield3D>,
  out: CollisionAabb3D,
): void {
  if (getCollisionHeightfieldValidationStatus3D(heightfield) !== null) {
    clearCollisionBounds3D(out);
    return;
  }
  writeCollisionTriangleMeshBounds3D(getCollisionHeightfieldTriangleMesh3D(heightfield), out);
}

export function writeCollisionTriangleMeshBounds3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  out: CollisionAabb3D,
): void {
  if (getCollisionTriangleMeshValidationStatus3D(mesh) !== null) {
    clearCollisionBounds3D(out);
    return;
  }
  const acceleration = getCollisionTriangleMeshAcceleration3D(mesh);
  const root = acceleration.nodes[0];
  out.minX = Infinity;
  out.minY = Infinity;
  out.minZ = Infinity;
  out.maxX = -Infinity;
  out.maxY = -Infinity;
  out.maxZ = -Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    writeCollisionTriangleMeshWorldPoint3D(
      mesh,
      (corner & 1) === 0 ? root.minX : root.maxX,
      (corner & 2) === 0 ? root.minY : root.maxY,
      (corner & 4) === 0 ? root.minZ : root.maxZ,
      scratchWorldPoint,
    );
    out.minX = Math.min(out.minX, scratchWorldPoint[0]);
    out.minY = Math.min(out.minY, scratchWorldPoint[1]);
    out.minZ = Math.min(out.minZ, scratchWorldPoint[2]);
    out.maxX = Math.max(out.maxX, scratchWorldPoint[0]);
    out.maxY = Math.max(out.maxY, scratchWorldPoint[1]);
    out.maxZ = Math.max(out.maxZ, scratchWorldPoint[2]);
  }
}

interface CollisionTriangleMeshAcceleration3D {
  points: readonly number[];
  indices: readonly number[];
  version: number;
  triangleCount: number;
  nodes: CollisionTriangleMeshNode3D[];
  order: number[];
}

interface CollisionTriangleMeshNode3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  start: number;
  count: number;
  left: number;
  right: number;
}

interface CollisionHeightfieldMeshCache3D {
  heights: readonly number[];
  columns: number;
  rows: number;
  cellSizeX: number;
  cellSizeZ: number;
  version: number;
  mesh: CollisionTriangleMesh3D;
}

interface CollisionHeightfieldValidationCache3D {
  heights: readonly number[];
  columns: number;
  rows: number;
  version: number;
  status: CollisionTestStatus | null;
}

interface CollisionTriangleMeshValidationCache3D {
  points: readonly number[];
  indices: readonly number[];
  version: number;
  status: CollisionTestStatus | null;
}

interface CollisionBounds3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

interface CollisionTriangleContactCandidate3D {
  x: number;
  y: number;
  z: number;
  depth: number;
  featureId: number;
}

function appendCollisionTriangleContactCandidate3D(
  x: number,
  y: number,
  z: number,
  depth: number,
  featureId: number,
): void {
  for (const existing of scratchContactCandidates) {
    const dx = existing.x - x;
    const dy = existing.y - y;
    const dz = existing.z - z;
    if (dx * dx + dy * dy + dz * dz <= CONTACT_POINT_EPSILON_SQUARED) {
      if (depth > existing.depth) existing.depth = depth;
      if (featureId < existing.featureId) existing.featureId = featureId;
      return;
    }
  }
  scratchContactCandidates.push({ x, y, z, depth, featureId });
}

function clearCollisionBounds3D(out: CollisionAabb3D): void {
  out.minX = 0;
  out.minY = 0;
  out.minZ = 0;
  out.maxX = 0;
  out.maxY = 0;
  out.maxZ = 0;
}

function buildCollisionTriangleMeshAcceleration3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
): CollisionTriangleMeshAcceleration3D {
  const triangleCount = mesh.indices.length / 3;
  const acceleration: CollisionTriangleMeshAcceleration3D = {
    points: mesh.points,
    indices: mesh.indices,
    version: mesh.version,
    triangleCount,
    nodes: [],
    order: new Array<number>(triangleCount),
  };
  for (let triangle = 0; triangle < triangleCount; triangle += 1) acceleration.order[triangle] = triangle;
  buildCollisionTriangleMeshNode3D(mesh, acceleration, 0, triangleCount);
  return acceleration;
}

function buildCollisionTriangleMeshNode3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  acceleration: CollisionTriangleMeshAcceleration3D,
  start: number,
  count: number,
): number {
  const nodeIndex = acceleration.nodes.length;
  const node: CollisionTriangleMeshNode3D = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    start,
    count,
    left: -1,
    right: -1,
  };
  acceleration.nodes.push(node);
  for (let i = start; i < start + count; i += 1) {
    writeCollisionTriangleMeshTriangleBounds3D(mesh, acceleration.order[i], scratchTriangleBounds);
    includeCollisionBounds3D(node, scratchTriangleBounds);
  }
  if (count <= TRIANGLE_BVH_LEAF_SIZE) return nodeIndex;

  const extentX = node.maxX - node.minX;
  const extentY = node.maxY - node.minY;
  const extentZ = node.maxZ - node.minZ;
  const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
  const ordered = acceleration.order.slice(start, start + count);
  ordered.sort(
    (a, b) =>
      getCollisionTriangleMeshTriangleCentroidAxis3D(mesh, a, axis) -
        getCollisionTriangleMeshTriangleCentroidAxis3D(mesh, b, axis) || a - b,
  );
  for (let i = 0; i < count; i += 1) acceleration.order[start + i] = ordered[i];
  const leftCount = Math.floor(count / 2);
  node.left = buildCollisionTriangleMeshNode3D(mesh, acceleration, start, leftCount);
  node.right = buildCollisionTriangleMeshNode3D(mesh, acceleration, start + leftCount, count - leftCount);
  node.count = 0;
  return nodeIndex;
}

function getCollisionContactManifoldDepth3D(manifold: Readonly<CollisionContactManifold3D>): number {
  let depth = 0;
  for (let i = 0; i < manifold.pointCount; i += 1) depth = Math.max(depth, manifold.points[i].depth);
  return depth;
}

function getCollisionHeightfieldTriangleMesh3D(heightfield: Readonly<CollisionHeightfield3D>): CollisionTriangleMesh3D {
  let cache = collisionHeightfieldMeshes3D.get(heightfield);
  if (
    cache === undefined ||
    cache.heights !== heightfield.heights ||
    cache.columns !== heightfield.columns ||
    cache.rows !== heightfield.rows ||
    cache.cellSizeX !== heightfield.cellSizeX ||
    cache.cellSizeZ !== heightfield.cellSizeZ ||
    cache.version !== heightfield.version
  ) {
    const points = new Array<number>(heightfield.columns * heightfield.rows * 3);
    for (let row = 0; row < heightfield.rows; row += 1) {
      for (let column = 0; column < heightfield.columns; column += 1) {
        const source = row * heightfield.columns + column;
        const target = source * 3;
        points[target] = column * heightfield.cellSizeX;
        points[target + 1] = heightfield.heights[source];
        points[target + 2] = row * heightfield.cellSizeZ;
      }
    }
    const indices = new Array<number>((heightfield.columns - 1) * (heightfield.rows - 1) * 6);
    let cursor = 0;
    for (let row = 0; row < heightfield.rows - 1; row += 1) {
      for (let column = 0; column < heightfield.columns - 1; column += 1) {
        const lowerLeft = row * heightfield.columns + column;
        const lowerRight = lowerLeft + 1;
        const upperLeft = lowerLeft + heightfield.columns;
        const upperRight = upperLeft + 1;
        indices[cursor] = lowerLeft;
        indices[cursor + 1] = upperRight;
        indices[cursor + 2] = lowerRight;
        indices[cursor + 3] = lowerLeft;
        indices[cursor + 4] = upperLeft;
        indices[cursor + 5] = upperRight;
        cursor += 6;
      }
    }
    cache = {
      heights: heightfield.heights,
      columns: heightfield.columns,
      rows: heightfield.rows,
      cellSizeX: heightfield.cellSizeX,
      cellSizeZ: heightfield.cellSizeZ,
      version: heightfield.version,
      mesh: createCollisionTriangleMesh3D(points, indices),
    };
    collisionHeightfieldMeshes3D.set(heightfield, cache);
  }
  const mesh = cache.mesh;
  mesh.x = heightfield.x;
  mesh.y = heightfield.y;
  mesh.z = heightfield.z;
  mesh.rotationX = heightfield.rotationX;
  mesh.rotationY = heightfield.rotationY;
  mesh.rotationZ = heightfield.rotationZ;
  mesh.rotationW = heightfield.rotationW;
  return mesh;
}

function getCollisionTriangleMeshAcceleration3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
): CollisionTriangleMeshAcceleration3D {
  let acceleration = collisionTriangleMeshAccelerations3D.get(mesh);
  if (
    acceleration === undefined ||
    acceleration.points !== mesh.points ||
    acceleration.indices !== mesh.indices ||
    acceleration.version !== mesh.version
  ) {
    acceleration = buildCollisionTriangleMeshAcceleration3D(mesh);
    collisionTriangleMeshAccelerations3D.set(mesh, acceleration);
  }
  return acceleration;
}

function getCollisionTriangleMeshTriangleCentroidAxis3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  triangle: number,
  axis: number,
): number {
  const offset = triangle * 3;
  const a = mesh.indices[offset] * 3 + axis;
  const b = mesh.indices[offset + 1] * 3 + axis;
  const c = mesh.indices[offset + 2] * 3 + axis;
  return (mesh.points[a] + mesh.points[b] + mesh.points[c]) / 3;
}

function includeCollisionBounds3D(target: CollisionBounds3D, source: Readonly<CollisionBounds3D>): void {
  target.minX = Math.min(target.minX, source.minX);
  target.minY = Math.min(target.minY, source.minY);
  target.minZ = Math.min(target.minZ, source.minZ);
  target.maxX = Math.max(target.maxX, source.maxX);
  target.maxY = Math.max(target.maxY, source.maxY);
  target.maxZ = Math.max(target.maxZ, source.maxZ);
}

function isCollisionBoundsOverlap3D(a: Readonly<CollisionBounds3D>, b: Readonly<CollisionBounds3D>): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY ||
    a.maxZ < b.minZ ||
    a.minZ > b.maxZ
  );
}

function isCollisionTriangleMeshTriangleValid3D(mesh: Readonly<CollisionTriangleMesh3D>, triangle: number): boolean {
  const offset = triangle * 3;
  const a = mesh.indices[offset] * 3;
  const b = mesh.indices[offset + 1] * 3;
  const c = mesh.indices[offset + 2] * 3;
  const abX = mesh.points[b] - mesh.points[a];
  const abY = mesh.points[b + 1] - mesh.points[a + 1];
  const abZ = mesh.points[b + 2] - mesh.points[a + 2];
  const acX = mesh.points[c] - mesh.points[a];
  const acY = mesh.points[c + 1] - mesh.points[a + 1];
  const acZ = mesh.points[c + 2] - mesh.points[a + 2];
  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;
  const crossLengthSquared = crossX * crossX + crossY * crossY + crossZ * crossZ;
  const abLengthSquared = abX * abX + abY * abY + abZ * abZ;
  const acLengthSquared = acX * acX + acY * acY + acZ * acZ;
  const scaleSquared = Math.max(abLengthSquared, acLengthSquared);
  return (
    Number.isFinite(crossLengthSquared) &&
    Number.isFinite(scaleSquared) &&
    crossLengthSquared > Number.EPSILON * Number.EPSILON * scaleSquared * scaleSquared
  );
}

function isCollisionTriangleSurfacePoseValid3D(
  shape: Readonly<
    Pick<CollisionTriangleMesh3D, 'x' | 'y' | 'z' | 'rotationX' | 'rotationY' | 'rotationZ' | 'rotationW'>
  >,
): boolean {
  const lengthSquared =
    shape.rotationX * shape.rotationX +
    shape.rotationY * shape.rotationY +
    shape.rotationZ * shape.rotationZ +
    shape.rotationW * shape.rotationW;
  return (
    Number.isFinite(shape.x) &&
    Number.isFinite(shape.y) &&
    Number.isFinite(shape.z) &&
    Number.isFinite(lengthSquared) &&
    Math.abs(lengthSquared - 1) <= QUATERNION_LENGTH_TOLERANCE
  );
}

function queryCollisionTriangleMeshCandidates3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  bounds: Readonly<CollisionBounds3D>,
  out: number[],
): void {
  out.length = 0;
  const acceleration = getCollisionTriangleMeshAcceleration3D(mesh);
  scratchNodeStack.length = 0;
  if (acceleration.nodes.length > 0) scratchNodeStack.push(0);
  while (scratchNodeStack.length > 0) {
    const nodeIndex = scratchNodeStack.pop();
    if (nodeIndex === undefined) break;
    const node = acceleration.nodes[nodeIndex];
    if (!isCollisionBoundsOverlap3D(bounds, node)) continue;
    if (node.count > 0) {
      for (let i = node.start; i < node.start + node.count; i += 1) out.push(acceleration.order[i]);
      continue;
    }
    if (node.right >= 0) scratchNodeStack.push(node.right);
    if (node.left >= 0) scratchNodeStack.push(node.left);
  }
  out.sort((a, b) => a - b);
}

function raycastCollisionTriangleLocal3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  triangle: number,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: number[],
  maxFraction: number,
): boolean {
  const offset = triangle * 3;
  const a = mesh.indices[offset] * 3;
  const b = mesh.indices[offset + 1] * 3;
  const c = mesh.indices[offset + 2] * 3;
  const edge1X = mesh.points[b] - mesh.points[a];
  const edge1Y = mesh.points[b + 1] - mesh.points[a + 1];
  const edge1Z = mesh.points[b + 2] - mesh.points[a + 2];
  const edge2X = mesh.points[c] - mesh.points[a];
  const edge2Y = mesh.points[c + 1] - mesh.points[a + 1];
  const edge2Z = mesh.points[c + 2] - mesh.points[a + 2];
  const pX = directionY * edge2Z - directionZ * edge2Y;
  const pY = directionZ * edge2X - directionX * edge2Z;
  const pZ = directionX * edge2Y - directionY * edge2X;
  const determinant = edge1X * pX + edge1Y * pY + edge1Z * pZ;
  if (Math.abs(determinant) <= RAY_EPSILON) return false;
  const inverse = 1 / determinant;
  const tX = originX - mesh.points[a];
  const tY = originY - mesh.points[a + 1];
  const tZ = originZ - mesh.points[a + 2];
  const u = (tX * pX + tY * pY + tZ * pZ) * inverse;
  if (u < 0 || u > 1) return false;
  const qX = tY * edge1Z - tZ * edge1Y;
  const qY = tZ * edge1X - tX * edge1Z;
  const qZ = tX * edge1Y - tY * edge1X;
  const v = (directionX * qX + directionY * qY + directionZ * qZ) * inverse;
  if (v < 0 || u + v > 1) return false;
  const fraction = (edge2X * qX + edge2Y * qY + edge2Z * qZ) * inverse;
  if (fraction < 0 || fraction > maxFraction) return false;
  out[0] = fraction;
  return true;
}

function raycastCollisionBoundsLocal3D(
  bounds: Readonly<CollisionBounds3D>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  maxFraction: number,
): boolean {
  let minimum = 0;
  let maximum = maxFraction;
  scratchRayOrigins[0] = originX;
  scratchRayOrigins[1] = originY;
  scratchRayOrigins[2] = originZ;
  scratchRayDirections[0] = directionX;
  scratchRayDirections[1] = directionY;
  scratchRayDirections[2] = directionZ;
  scratchRayBounds[0] = bounds.minX;
  scratchRayBounds[1] = bounds.minY;
  scratchRayBounds[2] = bounds.minZ;
  scratchRayBounds[3] = bounds.maxX;
  scratchRayBounds[4] = bounds.maxY;
  scratchRayBounds[5] = bounds.maxZ;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = scratchRayOrigins[axis];
    const direction = scratchRayDirections[axis];
    const lower = scratchRayBounds[axis];
    const upper = scratchRayBounds[axis + 3];
    if (Math.abs(direction) <= RAY_EPSILON) {
      if (origin < lower || origin > upper) return false;
      continue;
    }
    let first = (lower - origin) / direction;
    let last = (upper - origin) / direction;
    if (first > last) {
      const swap = first;
      first = last;
      last = swap;
    }
    minimum = Math.max(minimum, first);
    maximum = Math.min(maximum, last);
    if (minimum > maximum) return false;
  }
  return maximum >= 0;
}

function writeCollisionShapeBounds3D(
  shape: Readonly<CollisionShape3D>,
  support: NonNullable<ReturnType<typeof getCollisionSupport3D>>,
  out: CollisionBounds3D,
): void {
  support(shape, -1, 0, 0, scratchSupport);
  out.minX = scratchSupport[0];
  support(shape, 1, 0, 0, scratchSupport);
  out.maxX = scratchSupport[0];
  support(shape, 0, -1, 0, scratchSupport);
  out.minY = scratchSupport[1];
  support(shape, 0, 1, 0, scratchSupport);
  out.maxY = scratchSupport[1];
  support(shape, 0, 0, -1, scratchSupport);
  out.minZ = scratchSupport[2];
  support(shape, 0, 0, 1, scratchSupport);
  out.maxZ = scratchSupport[2];
}

function writeCollisionTriangleMeshLocalDirection3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  rotateCollisionVectorByQuaternion3D(-mesh.rotationX, -mesh.rotationY, -mesh.rotationZ, mesh.rotationW, x, y, z, out);
}

function writeCollisionTriangleMeshLocalPoint3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  writeCollisionTriangleMeshLocalDirection3D(mesh, x - mesh.x, y - mesh.y, z - mesh.z, out);
}

function writeCollisionTriangleMeshTriangleBounds3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  triangle: number,
  out: CollisionBounds3D,
): void {
  const offset = triangle * 3;
  const a = mesh.indices[offset] * 3;
  const b = mesh.indices[offset + 1] * 3;
  const c = mesh.indices[offset + 2] * 3;
  out.minX = Math.min(mesh.points[a], mesh.points[b], mesh.points[c]);
  out.minY = Math.min(mesh.points[a + 1], mesh.points[b + 1], mesh.points[c + 1]);
  out.minZ = Math.min(mesh.points[a + 2], mesh.points[b + 2], mesh.points[c + 2]);
  out.maxX = Math.max(mesh.points[a], mesh.points[b], mesh.points[c]);
  out.maxY = Math.max(mesh.points[a + 1], mesh.points[b + 1], mesh.points[c + 1]);
  out.maxZ = Math.max(mesh.points[a + 2], mesh.points[b + 2], mesh.points[c + 2]);
}

function writeCollisionTriangleMeshTriangleNormalLocal3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  triangle: number,
  out: number[],
): void {
  const offset = triangle * 3;
  const a = mesh.indices[offset] * 3;
  const b = mesh.indices[offset + 1] * 3;
  const c = mesh.indices[offset + 2] * 3;
  const abX = mesh.points[b] - mesh.points[a];
  const abY = mesh.points[b + 1] - mesh.points[a + 1];
  const abZ = mesh.points[b + 2] - mesh.points[a + 2];
  const acX = mesh.points[c] - mesh.points[a];
  const acY = mesh.points[c + 1] - mesh.points[a + 1];
  const acZ = mesh.points[c + 2] - mesh.points[a + 2];
  const x = abY * acZ - abZ * acY;
  const y = abZ * acX - abX * acZ;
  const z = abX * acY - abY * acX;
  const inverseLength = 1 / Math.hypot(x, y, z);
  out[0] = x * inverseLength;
  out[1] = y * inverseLength;
  out[2] = z * inverseLength;
}

function writeCollisionTriangleMeshTriangleWorld3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  triangle: number,
  out: number[],
): void {
  const offset = triangle * 3;
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const source = mesh.indices[offset + vertex] * 3;
    writeCollisionTriangleMeshWorldPoint3D(
      mesh,
      mesh.points[source],
      mesh.points[source + 1],
      mesh.points[source + 2],
      scratchWorldPoint,
    );
    const target = vertex * 3;
    out[target] = scratchWorldPoint[0];
    out[target + 1] = scratchWorldPoint[1];
    out[target + 2] = scratchWorldPoint[2];
  }
}

function writeCollisionTriangleMeshWorldDirection3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  rotateCollisionVectorByQuaternion3D(mesh.rotationX, mesh.rotationY, mesh.rotationZ, mesh.rotationW, x, y, z, out);
}

function writeCollisionTriangleMeshWorldPoint3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  writeCollisionTriangleMeshWorldDirection3D(mesh, x, y, z, out);
  out[0] += mesh.x;
  out[1] += mesh.y;
  out[2] += mesh.z;
}

function writeReducedCollisionTriangleContactCandidates3D(out: CollisionContactManifold3D): void {
  if (scratchContactCandidates.length === 0) {
    out.pointCount = 0;
    return;
  }
  scratchSelectedCandidates.length = 0;
  let first = 0;
  for (let i = 1; i < scratchContactCandidates.length; i += 1) {
    const candidate = scratchContactCandidates[i];
    const current = scratchContactCandidates[first];
    if (
      candidate.x < current.x ||
      (candidate.x === current.x && candidate.y < current.y) ||
      (candidate.x === current.x && candidate.y === current.y && candidate.z < current.z)
    ) {
      first = i;
    }
  }
  scratchSelectedCandidates.push(first);
  while (scratchSelectedCandidates.length < Math.min(4, scratchContactCandidates.length)) {
    let best = -1;
    let bestDistance = -1;
    for (let i = 0; i < scratchContactCandidates.length; i += 1) {
      if (scratchSelectedCandidates.includes(i)) continue;
      let minimumDistance = Infinity;
      for (const selected of scratchSelectedCandidates) {
        const dx = scratchContactCandidates[i].x - scratchContactCandidates[selected].x;
        const dy = scratchContactCandidates[i].y - scratchContactCandidates[selected].y;
        const dz = scratchContactCandidates[i].z - scratchContactCandidates[selected].z;
        minimumDistance = Math.min(minimumDistance, dx * dx + dy * dy + dz * dz);
      }
      if (minimumDistance > bestDistance) {
        bestDistance = minimumDistance;
        best = i;
      }
    }
    if (best < 0) break;
    scratchSelectedCandidates.push(best);
  }
  out.pointCount = scratchSelectedCandidates.length;
  for (let i = 0; i < out.pointCount; i += 1) {
    const source = scratchContactCandidates[scratchSelectedCandidates[i]];
    const target = out.points[i];
    target.x = source.x;
    target.y = source.y;
    target.z = source.z;
    target.depth = source.depth;
    target.featureId = source.featureId;
  }
}

function writeWorldBoundsInCollisionTriangleMeshLocal3D(
  mesh: Readonly<CollisionTriangleMesh3D>,
  bounds: Readonly<CollisionBounds3D>,
  out: CollisionBounds3D,
): void {
  out.minX = Infinity;
  out.minY = Infinity;
  out.minZ = Infinity;
  out.maxX = -Infinity;
  out.maxY = -Infinity;
  out.maxZ = -Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    writeCollisionTriangleMeshLocalPoint3D(
      mesh,
      (corner & 1) === 0 ? bounds.minX : bounds.maxX,
      (corner & 2) === 0 ? bounds.minY : bounds.maxY,
      (corner & 4) === 0 ? bounds.minZ : bounds.maxZ,
      scratchLocalPoint,
    );
    out.minX = Math.min(out.minX, scratchLocalPoint[0]);
    out.minY = Math.min(out.minY, scratchLocalPoint[1]);
    out.minZ = Math.min(out.minZ, scratchLocalPoint[2]);
    out.maxX = Math.max(out.maxX, scratchLocalPoint[0]);
    out.maxY = Math.max(out.maxY, scratchLocalPoint[1]);
    out.maxZ = Math.max(out.maxZ, scratchLocalPoint[2]);
  }
}

function rotateCollisionVectorByQuaternion3D(
  qX: number,
  qY: number,
  qZ: number,
  qW: number,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  const tX = 2 * (qY * z - qZ * y);
  const tY = 2 * (qZ * x - qX * z);
  const tZ = 2 * (qX * y - qY * x);
  out[0] = x + qW * tX + qY * tZ - qZ * tY;
  out[1] = y + qW * tY + qZ * tX - qX * tZ;
  out[2] = z + qW * tZ + qX * tY - qY * tX;
}

const CONTACT_DEPTH_EPSILON = 1e-7;
const CONTACT_NORMAL_ALIGNMENT = 0.98;
const CONTACT_POINT_EPSILON_SQUARED = 1e-12;
const QUATERNION_LENGTH_TOLERANCE = 1e-6;
const RAY_EPSILON = 1e-12;
const TRIANGLE_BVH_LEAF_SIZE = 8;

const collisionHeightfieldMeshes3D = new WeakMap<Readonly<CollisionHeightfield3D>, CollisionHeightfieldMeshCache3D>();
const collisionHeightfieldValidations3D = new WeakMap<
  Readonly<CollisionHeightfield3D>,
  CollisionHeightfieldValidationCache3D
>();
const collisionTriangleMeshAccelerations3D = new WeakMap<
  Readonly<CollisionTriangleMesh3D>,
  CollisionTriangleMeshAcceleration3D
>();
const collisionTriangleMeshValidations3D = new WeakMap<
  Readonly<CollisionTriangleMesh3D>,
  CollisionTriangleMeshValidationCache3D
>();

const scratchBounds: CollisionBounds3D = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const scratchContactCandidates: CollisionTriangleContactCandidate3D[] = [];
const scratchLocalBounds: CollisionBounds3D = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const scratchLocalDirection = [0, 0, 0];
const scratchLocalOrigin = [0, 0, 0];
const scratchLocalPoint = [0, 0, 0];
const scratchManifold = createCollisionContactManifold3D();
const scratchNodeStack: number[] = [];
const scratchNormal = [0, 0, 0];
const scratchRay = [0];
const scratchRayBounds = [0, 0, 0, 0, 0, 0];
const scratchRayDirections = [0, 0, 0];
const scratchRayOrigins = [0, 0, 0];
const scratchSelectedCandidates: number[] = [];
const scratchSupport = [0, 0, 0];
const scratchTimeOfImpact = createCollisionTimeOfImpact3D();
const scratchTriangle: Extract<CollisionBuiltInShape3D, { kind: 'convex' }> = {
  kind: 'convex',
  points: new Array<number>(9).fill(0),
};
const scratchTriangleBounds: CollisionBounds3D = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const scratchTriangles: number[] = [];
const scratchWorldNormal = [0, 0, 0];
const scratchWorldPoint = [0, 0, 0];
