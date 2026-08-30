import { createEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  SpatialAabb3D,
  SpatialIndexBackend3D,
  SpatialIndexingExplanation,
  SpatialIndexingMode,
  SpatialIndexingOperation,
  SpatialIndexingReason,
  SpatialObjectId,
  SpatialPair,
} from '@flighthq/types/contract';

import { reportSpatialIndexing } from './spatialIndexingGuard';

// A dynamic bounding-volume hierarchy: the second 3D backend, beside the uniform grid.
//
// The grid is the right structure when objects are roughly one size and the world has a scale; a tree
// is the right one when neither holds. A grid cell is a fixed world length, so an object much larger
// than a cell occupies many of them and an object much smaller wastes one — and an unbounded world has
// no cell size that is right anywhere. A tree adapts: it subdivides where objects are and nowhere else,
// costs O(log n) per query regardless of extent, and has no tuning constant that can be wrong.
//
// It is DYNAMIC in the specific sense that leaves carry FAT bounds — the object's box grown by a
// margin — so a body that moves a little stays inside the bounds already in the tree and needs no
// reinsertion at all. That is what makes it usable for a physics broadphase, where nearly every object
// moves nearly every step: without the margin, every step would be a full remove-and-reinsert.
//
// The margin buys cheap updates at the cost of looser traversal, which is why queries test a leaf's
// EXACT bounds before publishing it. Traversal uses the fat box; the answer uses the real one. Skipping
// that second test would make this backend report overlaps the grid does not, and the two are supposed
// to be interchangeable.

// Creates a BVH backend. `margin` is how far each leaf's stored box is grown beyond its object; a
// larger margin means fewer reinsertions and looser internal nodes.
//
// The default suits a world whose objects are order-of-magnitude single-digit units and move a few
// units per step. It is a world-space LENGTH, like the grid's cell size, so the two tune against the
// same intuition.
export function createBvhSpatialBackend3D(margin = DEFAULT_BVH_MARGIN_3D): SpatialIndexBackend3D & Entity {
  const tree = createBvh3D(margin);
  return createEntity({
    clearSpatialIndex: () => clearBvh3D(tree),
    explainSpatialIndexing: (id) => explainBvh3D(tree, id),
    insertSpatialObject: (id, bounds) => insertBvh3D(tree, id, bounds, 'insert'),
    querySpatialPairs: (out) => queryBvh3DPairs(tree, out),
    querySpatialPoint: (x, y, z, out) => queryBvh3DPoint(tree, x, y, z, out),
    querySpatialRay: (x, y, z, dx, dy, dz, out) => queryBvh3DRay(tree, x, y, z, dx, dy, dz, out),
    querySpatialRegion: (region, out) => queryBvh3DRegion(tree, region, out),
    removeSpatialObject: (id) => {
      const wasMissing = !tree.leafByObject.has(id) && !tree.declined.has(id);
      removeBvh3D(tree, id);
      if (wasMissing) reportBvh3DIndexing(tree, id, 'absent', 'remove', 'missing-id');
    },
    updateSpatialObject: (id, bounds) => {
      const wasMissing = !tree.leafByObject.has(id) && !tree.declined.has(id);
      const inserted = insertBvh3D(tree, id, bounds, 'update');
      if (wasMissing) reportBvh3DIndexing(tree, id, explainBvh3D(tree, id).mode, 'update', 'missing-id');
      return inserted;
    },
  } satisfies SpatialIndexBackend3D);
}

interface Bvh3D {
  margin: number;
  root: number;
  // Parallel arrays rather than node objects: one allocation per field that grows by doubling, no
  // per-node object header, and a shape that lowers to a struct-of-arrays in the C port.
  minX: number[];
  minY: number[];
  minZ: number[];
  maxX: number[];
  maxY: number[];
  maxZ: number[];
  parent: number[];
  child1: number[];
  child2: number[];
  height: number[];
  object: number[];
  freeList: number[];
  count: number;
  leafByObject: Map<SpatialObjectId, number>;
  bounds: Map<SpatialObjectId, SpatialAabb3D>;
  declined: Map<SpatialObjectId, 'inverted-bounds' | 'non-finite-bounds'>;
  stack: number[];
}

function createBvh3D(margin: number): Bvh3D {
  return {
    bounds: new Map(),
    child1: [],
    child2: [],
    count: 0,
    declined: new Map(),
    freeList: [],
    height: [],
    leafByObject: new Map(),
    margin: Number.isFinite(margin) && margin >= 0 ? margin : 0,
    maxX: [],
    maxY: [],
    maxZ: [],
    minX: [],
    minY: [],
    minZ: [],
    object: [],
    parent: [],
    root: NIL,
    stack: [],
  };
}

function clearBvh3D(tree: Bvh3D): void {
  tree.root = NIL;
  tree.count = 0;
  tree.freeList.length = 0;
  tree.minX.length = 0;
  tree.minY.length = 0;
  tree.minZ.length = 0;
  tree.maxX.length = 0;
  tree.maxY.length = 0;
  tree.maxZ.length = 0;
  tree.parent.length = 0;
  tree.child1.length = 0;
  tree.child2.length = 0;
  tree.height.length = 0;
  tree.object.length = 0;
  tree.leafByObject.clear();
  tree.bounds.clear();
  tree.declined.clear();
}

// A tree reports `cells` for an indexed object and a bucket count of zero.
//
// The mode vocabulary is shared with the grid and is grid-SHAPED — `cells` names a structure this one
// does not have. It is used anyway because it is the only member meaning "indexed normally", and
// `SpatialIndexingExplanation` already anticipates a bucketless structure by defining `bucketCount` as
// zero for one. Renaming the mode would change a vocabulary every backend and both dimensions share.
function explainBvh3D(tree: Readonly<Bvh3D>, id: SpatialObjectId): SpatialIndexingExplanation {
  const reason = tree.declined.get(id);
  if (reason !== undefined) return { bucketCount: 0, id, mode: 'declined', reason };
  if (!tree.leafByObject.has(id)) return { bucketCount: 0, id, mode: 'absent', reason: null };
  return { bucketCount: 0, id, mode: 'cells', reason: null };
}

function insertBvh3D(
  tree: Bvh3D,
  id: SpatialObjectId,
  bounds: Readonly<SpatialAabb3D>,
  operation: SpatialIndexingOperation,
): boolean {
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY) ||
    !Number.isFinite(bounds.maxZ)
  ) {
    removeBvh3D(tree, id);
    tree.declined.set(id, 'non-finite-bounds');
    reportBvh3DIndexing(tree, id, 'declined', operation, 'non-finite-bounds');
    return false;
  }
  if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY || bounds.maxZ < bounds.minZ) {
    removeBvh3D(tree, id);
    tree.declined.set(id, 'inverted-bounds');
    reportBvh3DIndexing(tree, id, 'declined', operation, 'inverted-bounds');
    return false;
  }
  tree.declined.delete(id);

  const existing = tree.leafByObject.get(id);
  if (existing !== undefined) {
    // The whole point of the margin: if the object still sits inside the box already in the tree, the
    // tree does not change at all. Only the exact bounds are refreshed, because queries answer from
    // those and a stale one would report last step's overlap as this step's.
    if (
      bounds.minX >= tree.minX[existing] &&
      bounds.minY >= tree.minY[existing] &&
      bounds.minZ >= tree.minZ[existing] &&
      bounds.maxX <= tree.maxX[existing] &&
      bounds.maxY <= tree.maxY[existing] &&
      bounds.maxZ <= tree.maxZ[existing]
    ) {
      copyBounds3D(bounds, tree.bounds.get(id) as SpatialAabb3D);
      return true;
    }
    removeBvh3D(tree, id);
  }

  const leaf = allocateBvh3DNode(tree);
  const margin = tree.margin;
  tree.minX[leaf] = bounds.minX - margin;
  tree.minY[leaf] = bounds.minY - margin;
  tree.minZ[leaf] = bounds.minZ - margin;
  tree.maxX[leaf] = bounds.maxX + margin;
  tree.maxY[leaf] = bounds.maxY + margin;
  tree.maxZ[leaf] = bounds.maxZ + margin;
  tree.object[leaf] = id;
  tree.height[leaf] = 0;
  tree.child1[leaf] = NIL;
  tree.child2[leaf] = NIL;
  tree.leafByObject.set(id, leaf);
  tree.bounds.set(id, {
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    maxZ: bounds.maxZ,
    minX: bounds.minX,
    minY: bounds.minY,
    minZ: bounds.minZ,
  });
  tree.count += 1;

  insertBvh3DLeaf(tree, leaf);
  return true;
}

function removeBvh3D(tree: Bvh3D, id: SpatialObjectId): void {
  tree.declined.delete(id);
  const leaf = tree.leafByObject.get(id);
  if (leaf === undefined) return;
  tree.leafByObject.delete(id);
  tree.bounds.delete(id);
  tree.count -= 1;
  removeBvh3DLeaf(tree, leaf);
  freeBvh3DNode(tree, leaf);
}

// Descends to the leaf whose enclosing box grows LEAST by taking this one, which is the surface-area
// heuristic in its simplest form. Descending by centre distance instead builds a tree that looks
// balanced and traverses badly, because a node's cost is the area a ray or box must test against, not
// how evenly its children are counted.
function insertBvh3DLeaf(tree: Bvh3D, leaf: number): void {
  if (tree.root === NIL) {
    tree.root = leaf;
    tree.parent[leaf] = NIL;
    return;
  }

  let index = tree.root;
  while (tree.height[index] > 0) {
    const child1 = tree.child1[index];
    const child2 = tree.child2[index];
    const area = boundsArea(tree, index);
    const combined = combinedArea(tree, index, leaf);

    // The cost of putting the leaf here rather than deeper: a new parent covering both, plus the growth
    // this node's own box would take on the way down.
    const branchCost = 2 * combined;
    const inheritanceCost = 2 * (combined - area);

    const cost1 = descentCost(tree, child1, leaf, inheritanceCost);
    const cost2 = descentCost(tree, child2, leaf, inheritanceCost);
    if (branchCost < cost1 && branchCost < cost2) break;
    index = cost1 < cost2 ? child1 : child2;
  }

  const sibling = index;
  const oldParent = tree.parent[sibling];
  const newParent = allocateBvh3DNode(tree);
  tree.parent[newParent] = oldParent;
  tree.object[newParent] = NIL;
  tree.child1[newParent] = sibling;
  tree.child2[newParent] = leaf;
  tree.height[newParent] = tree.height[sibling] + 1;
  unionBounds(tree, newParent, sibling, leaf);
  tree.parent[sibling] = newParent;
  tree.parent[leaf] = newParent;

  if (oldParent === NIL) tree.root = newParent;
  else if (tree.child1[oldParent] === sibling) tree.child1[oldParent] = newParent;
  else tree.child2[oldParent] = newParent;

  refitBvh3DAncestors(tree, tree.parent[leaf]);
}

function removeBvh3DLeaf(tree: Bvh3D, leaf: number): void {
  if (leaf === tree.root) {
    tree.root = NIL;
    return;
  }
  const parent = tree.parent[leaf];
  const grandParent = tree.parent[parent];
  const sibling = tree.child1[parent] === leaf ? tree.child2[parent] : tree.child1[parent];

  // The parent existed only to hold two children; with one gone it is pure indirection, so the sibling
  // takes its place rather than the parent surviving with a single child.
  if (grandParent === NIL) {
    tree.root = sibling;
    tree.parent[sibling] = NIL;
    freeBvh3DNode(tree, parent);
    return;
  }
  if (tree.child1[grandParent] === parent) tree.child1[grandParent] = sibling;
  else tree.child2[grandParent] = sibling;
  tree.parent[sibling] = grandParent;
  freeBvh3DNode(tree, parent);
  refitBvh3DAncestors(tree, grandParent);
}

// Walks to the root re-deriving each node's box and height, rebalancing as it goes.
//
// Both must happen on the way UP and in that order: a node's box is the union of its children's, so a
// change at a leaf is only visible to a query once every ancestor has been rewritten. Refitting lazily
// would leave a parent claiming a region its children no longer cover, which loses objects silently
// rather than loudly.
function refitBvh3DAncestors(tree: Bvh3D, start: number): void {
  let index = start;
  while (index !== NIL) {
    index = balanceBvh3D(tree, index);
    const child1 = tree.child1[index];
    const child2 = tree.child2[index];
    tree.height[index] = 1 + Math.max(tree.height[child1], tree.height[child2]);
    unionBounds(tree, index, child1, child2);
    index = tree.parent[index];
  }
}

// One AVL-style rotation when a node's children differ in height by more than one, returning whichever
// node now occupies the position. Without it a run of sorted insertions degenerates to a list and every
// query becomes linear.
function balanceBvh3D(tree: Bvh3D, index: number): number {
  if (tree.height[index] < 2) return index;
  const child1 = tree.child1[index];
  const child2 = tree.child2[index];
  const balance = tree.height[child2] - tree.height[child1];
  if (balance > 1) return rotateBvh3D(tree, index, child2);
  if (balance < -1) return rotateBvh3D(tree, index, child1);
  return index;
}

// Promotes `heavy` above `index`, re-parenting whichever of its children is taller to keep the result
// balanced.
function rotateBvh3D(tree: Bvh3D, index: number, heavy: number): number {
  const heavyChild1 = tree.child1[heavy];
  const heavyChild2 = tree.child2[heavy];
  tree.child1[heavy] = index;
  tree.parent[heavy] = tree.parent[index];
  tree.parent[index] = heavy;

  const grandParent = tree.parent[heavy];
  if (grandParent === NIL) tree.root = heavy;
  else if (tree.child1[grandParent] === index) tree.child1[grandParent] = heavy;
  else tree.child2[grandParent] = heavy;

  const promote = tree.height[heavyChild1] > tree.height[heavyChild2] ? heavyChild1 : heavyChild2;
  const demote = promote === heavyChild1 ? heavyChild2 : heavyChild1;
  tree.child2[heavy] = promote;
  if (tree.child1[index] === heavy) tree.child1[index] = demote;
  else tree.child2[index] = demote;
  tree.parent[demote] = index;

  unionBounds(tree, index, tree.child1[index], tree.child2[index]);
  unionBounds(tree, heavy, tree.child1[heavy], tree.child2[heavy]);
  tree.height[index] = 1 + Math.max(tree.height[tree.child1[index]], tree.height[tree.child2[index]]);
  tree.height[heavy] = 1 + Math.max(tree.height[tree.child1[heavy]], tree.height[tree.child2[heavy]]);
  return heavy;
}

function queryBvh3DPairs(tree: Readonly<Bvh3D>, out: SpatialPair[]): void {
  let written = 0;
  if (tree.root === NIL) {
    out.length = 0;
    return;
  }
  tree.leafByObject.forEach((leaf, id) => {
    const exact = tree.bounds.get(id);
    if (exact === undefined) return;
    const stack = tree.stack;
    stack.length = 0;
    stack.push(tree.root);
    while (stack.length > 0) {
      const node = stack.pop() as number;
      if (node === NIL || node === leaf) continue;
      if (!nodeOverlapsBounds(tree, node, exact)) continue;
      if (tree.height[node] === 0) {
        const other = tree.object[node];
        // Each unordered pair once. Comparing ids rather than tracking a seen-set is what keeps this
        // allocation-free, and it is why a pair is emitted by the lower-id member only.
        if (other <= id) continue;
        const otherExact = tree.bounds.get(other);
        if (otherExact !== undefined && boundsOverlap3D(exact, otherExact)) {
          const pair = out[written];
          if (pair === undefined) out.push({ a: id, b: other });
          else {
            pair.a = id;
            pair.b = other;
          }
          written += 1;
        }
        continue;
      }
      stack.push(tree.child1[node]);
      stack.push(tree.child2[node]);
    }
  });
  out.length = written;
}

function queryBvh3DPoint(tree: Readonly<Bvh3D>, x: number, y: number, z: number, out: SpatialObjectId[]): void {
  out.length = 0;
  if (tree.root === NIL) return;
  const stack = tree.stack;
  stack.length = 0;
  stack.push(tree.root);
  while (stack.length > 0) {
    const node = stack.pop() as number;
    if (node === NIL) continue;
    if (
      x < tree.minX[node] ||
      x > tree.maxX[node] ||
      y < tree.minY[node] ||
      y > tree.maxY[node] ||
      z < tree.minZ[node] ||
      z > tree.maxZ[node]
    ) {
      continue;
    }
    if (tree.height[node] === 0) {
      const exact = tree.bounds.get(tree.object[node]);
      // Half-open [min, max) on every axis, matching the grid: a point exactly on a maximum face is
      // outside. Sharing the convention is what keeps a point on a shared face from belonging to two
      // adjacent boxes in one backend and one box in the other.
      if (
        exact !== undefined &&
        x >= exact.minX &&
        x < exact.maxX &&
        y >= exact.minY &&
        y < exact.maxY &&
        z >= exact.minZ &&
        z < exact.maxZ
      ) {
        out.push(tree.object[node]);
      }
      continue;
    }
    stack.push(tree.child1[node]);
    stack.push(tree.child2[node]);
  }
}

function queryBvh3DRay(
  tree: Readonly<Bvh3D>,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  out: SpatialObjectId[],
): void {
  out.length = 0;
  if (tree.root === NIL) return;
  const stack = tree.stack;
  stack.length = 0;
  stack.push(tree.root);
  while (stack.length > 0) {
    const node = stack.pop() as number;
    if (node === NIL) continue;
    if (
      !raySlabsHit(
        x,
        y,
        z,
        dx,
        dy,
        dz,
        tree.minX[node],
        tree.minY[node],
        tree.minZ[node],
        tree.maxX[node],
        tree.maxY[node],
        tree.maxZ[node],
      )
    ) {
      continue;
    }
    if (tree.height[node] === 0) {
      const exact = tree.bounds.get(tree.object[node]);
      if (
        exact !== undefined &&
        raySlabsHit(x, y, z, dx, dy, dz, exact.minX, exact.minY, exact.minZ, exact.maxX, exact.maxY, exact.maxZ)
      ) {
        out.push(tree.object[node]);
      }
      continue;
    }
    stack.push(tree.child1[node]);
    stack.push(tree.child2[node]);
  }
}

function queryBvh3DRegion(tree: Readonly<Bvh3D>, region: Readonly<SpatialAabb3D>, out: SpatialObjectId[]): void {
  out.length = 0;
  if (tree.root === NIL) return;
  const stack = tree.stack;
  stack.length = 0;
  stack.push(tree.root);
  while (stack.length > 0) {
    const node = stack.pop() as number;
    if (node === NIL || !nodeOverlapsBounds(tree, node, region)) continue;
    if (tree.height[node] === 0) {
      const exact = tree.bounds.get(tree.object[node]);
      if (exact !== undefined && boundsOverlap3D(exact, region)) out.push(tree.object[node]);
      continue;
    }
    stack.push(tree.child1[node]);
    stack.push(tree.child2[node]);
  }
}

function allocateBvh3DNode(tree: Bvh3D): number {
  const recycled = tree.freeList.pop();
  if (recycled !== undefined) {
    tree.parent[recycled] = NIL;
    tree.child1[recycled] = NIL;
    tree.child2[recycled] = NIL;
    tree.height[recycled] = 0;
    tree.object[recycled] = NIL;
    return recycled;
  }
  const index = tree.minX.length;
  tree.minX.push(0);
  tree.minY.push(0);
  tree.minZ.push(0);
  tree.maxX.push(0);
  tree.maxY.push(0);
  tree.maxZ.push(0);
  tree.parent.push(NIL);
  tree.child1.push(NIL);
  tree.child2.push(NIL);
  tree.height.push(0);
  tree.object.push(NIL);
  return index;
}

function freeBvh3DNode(tree: Bvh3D, index: number): void {
  tree.parent[index] = NIL;
  tree.child1[index] = NIL;
  tree.child2[index] = NIL;
  tree.object[index] = NIL;
  tree.height[index] = -1;
  tree.freeList.push(index);
}

function boundsArea(tree: Readonly<Bvh3D>, index: number): number {
  const dx = tree.maxX[index] - tree.minX[index];
  const dy = tree.maxY[index] - tree.minY[index];
  const dz = tree.maxZ[index] - tree.minZ[index];
  return 2 * (dx * dy + dy * dz + dz * dx);
}

// STRICT on every axis, so two boxes that merely touch do not overlap — the convention the uniform grid
// already uses. The two backends sit behind one seam and a caller may swap them, so a boundary case must
// not answer differently depending on which is installed. Node traversal above stays INCLUSIVE on
// purpose: a conservative descent may visit a leaf that then fails this test, but it must never prune one
// that would have passed it.
function boundsOverlap3D(a: Readonly<SpatialAabb3D>, b: Readonly<SpatialAabb3D>): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function combinedArea(tree: Readonly<Bvh3D>, a: number, b: number): number {
  const dx = Math.max(tree.maxX[a], tree.maxX[b]) - Math.min(tree.minX[a], tree.minX[b]);
  const dy = Math.max(tree.maxY[a], tree.maxY[b]) - Math.min(tree.minY[a], tree.minY[b]);
  const dz = Math.max(tree.maxZ[a], tree.maxZ[b]) - Math.min(tree.minZ[a], tree.minZ[b]);
  return 2 * (dx * dy + dy * dz + dz * dx);
}

function copyBounds3D(source: Readonly<SpatialAabb3D>, target: SpatialAabb3D): void {
  target.minX = source.minX;
  target.minY = source.minY;
  target.minZ = source.minZ;
  target.maxX = source.maxX;
  target.maxY = source.maxY;
  target.maxZ = source.maxZ;
}

// What descending into `child` would cost. A leaf costs the box that would enclose it and the newcomer;
// an internal node costs only the GROWTH, because its existing area is already paid for.
function descentCost(tree: Readonly<Bvh3D>, child: number, leaf: number, inheritanceCost: number): number {
  const combined = combinedArea(tree, child, leaf);
  if (tree.height[child] === 0) return combined + inheritanceCost;
  return combined - boundsArea(tree, child) + inheritanceCost;
}

function nodeOverlapsBounds(tree: Readonly<Bvh3D>, index: number, region: Readonly<SpatialAabb3D>): boolean {
  return (
    tree.minX[index] <= region.maxX &&
    tree.maxX[index] >= region.minX &&
    tree.minY[index] <= region.maxY &&
    tree.maxY[index] >= region.minY &&
    tree.minZ[index] <= region.maxZ &&
    tree.maxZ[index] >= region.minZ
  );
}

// Slab test for a FORWARD ray, matching the uniform grid's reading: the ray extends from its origin in
// the direction given and not behind it. A zero component is parallel to that pair of planes, which is
// a hit exactly when the origin already lies between them.
function raySlabsHit(
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): boolean {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axis === 0 ? x : axis === 1 ? y : z;
    const direction = axis === 0 ? dx : axis === 1 ? dy : dz;
    const low = axis === 0 ? minX : axis === 1 ? minY : minZ;
    const high = axis === 0 ? maxX : axis === 1 ? maxY : maxZ;
    if (direction === 0) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const inverse = 1 / direction;
    let t0 = (low - origin) * inverse;
    let t1 = (high - origin) * inverse;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return false;
  }
  return true;
}

function reportBvh3DIndexing(
  tree: Readonly<Bvh3D>,
  id: SpatialObjectId,
  mode: SpatialIndexingMode,
  operation: SpatialIndexingOperation,
  // Wider than the EXPLANATION's reason, which carries only decline causes. A notice also reports
  // `missing-id`, which is a fault in the operation rather than a property of the stored object, so
  // there is nothing for a later `explainSpatialIndexing` to return. Matches the grids' reporter.
  reason: SpatialIndexingReason | null,
): void {
  // Only ever called for a fault: a declined insert, or an operation naming an id the tree does not
  // hold. An ordinary successful insert or update reports NOTHING, which is what both grids do and what
  // the shared formatter is written against — it has no advice for `cells` because no backend is
  // supposed to raise it. Reporting success instead makes the guard fire once per object per step, so
  // the one notice that matters arrives buried in thousands that do not.
  //
  // `cellSize` is the grid's tuning constant and a tree has none, so the margin is reported in its
  // place: it is the number a caller would tune for the same reason, and leaving the field at zero
  // would tell a diagnostic reader the structure was misconfigured.
  reportSpatialIndexing({ cellSize: tree.margin, id, mode, operation, reason, wouldOccupyBucketCount: 0 });
}

function unionBounds(tree: Bvh3D, target: number, a: number, b: number): void {
  tree.minX[target] = Math.min(tree.minX[a], tree.minX[b]);
  tree.minY[target] = Math.min(tree.minY[a], tree.minY[b]);
  tree.minZ[target] = Math.min(tree.minZ[a], tree.minZ[b]);
  tree.maxX[target] = Math.max(tree.maxX[a], tree.maxX[b]);
  tree.maxY[target] = Math.max(tree.maxY[a], tree.maxY[b]);
  tree.maxZ[target] = Math.max(tree.maxZ[a], tree.maxZ[b]);
}

// The sentinel for "no node", matching the -1 an index into a parallel array cannot hold.
const NIL = -1;

// A world-space length, chosen against the same intuition as the grid's default cell size: a few units,
// suiting objects of order single-digit units moving a few units per step.
const DEFAULT_BVH_MARGIN_3D = 2;
