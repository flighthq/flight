import { containsRectanglePointXY, intersectsRectangle, inverseMatrixTransformPointXY } from '@flighthq/geometry';
import {
  getNodeLocalBoundsRectangle,
  getNodeParent,
  getNodeRuntime,
  getNodeWorldBoundsRectangle,
  getNodeWorldTransformMatrix,
} from '@flighthq/node';
import { containsPathPoint } from '@flighthq/path';
import type {
  DisplayObject,
  HitArea,
  HitTestFunction,
  HitTestPreciseFunction,
  HitTestResult,
  Kind,
  Node,
  NodeAny,
  Path,
  Rectangle,
} from '@flighthq/types';

import { getNodeInteractionState } from './nodeInteractionState';

/**
 * Fills `out` with the sub-index and local coordinates of a hit at world-space (x, y) on a node you
 * already have (usually the result of a `*Precise` query, or a dispatch target). `out.subIndex` is the
 * sub-element under the point (text char, tile, quad) from the node kind's registered exact provider, or
 * -1 when the kind has no provider. This is the "resolve detail on a known node" call — it does no walk.
 **/
export function describeGraphHit(node: NodeAny, x: number, y: number, out: HitTestResult): void {
  out.node = node;
  inverseMatrixTransformPointXY(hitTestScratchPoint, getNodeWorldTransformMatrix(node as DisplayObject), x, y);
  out.localX = hitTestScratchPoint.x;
  out.localY = hitTestScratchPoint.y;
  const exact = hitTestExactRegistry.get(node.kind);
  out.subIndex = exact ? exact(node, x, y) : -1;
}

/**
 * Coarse pick: front-to-back (reverse child order), the first node whose bounding geometry contains
 * world-space (x, y), or null. Eligibility is opt-in (`hitTestEnabled`, default off); a node with a
 * `hitArea` is an atomic unit that consumes the hit and hides its children. Cheap — the bbox path.
 **/
export function findGraphHitTarget<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
): Node<Traits> | null {
  return findFirstHit(source as NodeAny, x, y, false) as Node<Traits> | null;
}

/**
 * Precise pick: like `findGraphHitTarget`, but each node is tested by its registered exact geometry
 * (fill/alpha/glyph), **falling back to bounds per kind** where no exact provider is registered — so
 * the answer is the most precise available. Pays for the exact math; use on click/select, not per move.
 **/
export function findGraphHitTargetPrecise<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
): Node<Traits> | null {
  return findFirstHit(source as NodeAny, x, y, true) as Node<Traits> | null;
}

/**
 * Coarse stack: every node whose bounding geometry contains (x, y), front-to-back into `out` (cleared
 * first). The "what is under this point" query — overlapping targets, multi-pick.
 **/
export function findGraphHitTargets<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  out: Node<Traits>[] = [],
): Node<Traits>[] {
  out.length = 0;
  collectHits(source as NodeAny, x, y, false, out as NodeAny[]);
  return out;
}

/** Precise stack: `findGraphHitTargets` using exact geometry per kind (bounds fallback where none). */
export function findGraphHitTargetsPrecise<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  out: Node<Traits>[] = [],
): Node<Traits>[] {
  out.length = 0;
  collectHits(source as NodeAny, x, y, true, out as NodeAny[]);
  return out;
}

/**
 * Evaluates the world bounding box of one node to see if it overlaps or
 * intersects the world bounding box of another.
 **/
export function hitTestDisplayObjects(source: DisplayObject, other: DisplayObject): boolean {
  if (getNodeParent(source) !== null && getNodeParent(other) !== null) {
    return intersectsRectangle(getNodeWorldBoundsRectangle(source), getNodeWorldBoundsRectangle(other));
  }
  return false;
}

/**
 * Tests whether world-space (x, y) falls within the node's local bounds rect,
 * after inverting through the node's world transform.
 **/
export function hitTestGraphLocalBounds<Traits extends object>(source: Node<Traits>, x: number, y: number): boolean {
  inverseMatrixTransformPointXY(hitTestScratchPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  return containsRectanglePointXY(
    getNodeLocalBoundsRectangle(source as DisplayObject),
    hitTestScratchPoint.x,
    hitTestScratchPoint.y,
  );
}

/** Coarse any-hit query: whether the node or any descendant is hit at (x, y). Traversal order is irrelevant to the boolean. */
export function hitTestGraphPoint<Traits extends object>(source: Node<Traits>, x: number, y: number): boolean {
  return anyHit(source as NodeAny, x, y, false);
}

/** Precise any-hit query: `hitTestGraphPoint` using exact geometry per kind (bounds fallback where none). */
export function hitTestGraphPointPrecise<Traits extends object>(source: Node<Traits>, x: number, y: number): boolean {
  return anyHit(source as NodeAny, x, y, true);
}

/**
 * Tests one node's own hit region at world-space (x, y): its `hitArea` if set, else its kind geometry
 * (coarse bounds, or the exact provider when `precise`). No eligibility check and no recursion — for
 * callers (e.g. the broadphase) that already hold an eligible, atomic candidate.
 **/
export function hitTestNodeRegion(source: NodeAny, x: number, y: number, precise: boolean = false): boolean {
  const hitArea = getNodeInteractionState(source)?.hitArea ?? null;
  if (hitArea !== null) return hitAreaContainsPoint(source, hitArea, x, y);
  return testNodeGeometry(source, x, y, precise);
}

/**
 * Registers a node kind's coarse (bounding) hit function — the bbox path used by the non-`Precise`
 * queries. Open registry: register only the kinds you need, or `registerDefaultHitTests()` for the bank.
 **/
export function registerHitTest(kind: Kind, fn: HitTestFunction): void {
  hitTestRegistry.set(kind, fn);
}

/**
 * Registers a node kind's exact (precise) hit provider — used by the `*Precise` queries and by
 * `describeGraphHit`. The provider returns -1 (miss), 0 (hit, no sub-element), or a sub-index (>0).
 * Opt-in per kind so the exact geometry and its dependencies tree-shake unless registered.
 **/
export function registerHitTestPrecise(kind: Kind, fn: HitTestPreciseFunction): void {
  hitTestExactRegistry.set(kind, fn);
}

// Front-to-back DFS for the first hit; shared by findGraphHitTarget(Precise).
function findFirstHit(node: NodeAny, x: number, y: number, precise: boolean): NodeAny | null {
  if (!node.enabled) return null;

  const state = getNodeInteractionState(node);
  const enabled = state?.hitTestEnabled === true;
  const hitArea = state?.hitArea ?? null;

  if (enabled && hitArea !== null) {
    return hitAreaContainsPoint(node, hitArea, x, y) ? node : null;
  }

  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = findFirstHit(children[i] as NodeAny, x, y, precise);
      if (hit !== null) return hit;
    }
  }

  if (enabled && testNodeGeometry(node, x, y, precise)) return node;
  return null;
}

// DFS any-hit; order-independent boolean.
function anyHit(node: NodeAny, x: number, y: number, precise: boolean): boolean {
  if (!node.enabled) return false;

  const state = getNodeInteractionState(node);
  const enabled = state?.hitTestEnabled === true;
  const hitArea = state?.hitArea ?? null;

  if (enabled && hitArea !== null) return hitAreaContainsPoint(node, hitArea, x, y);
  if (enabled && testNodeGeometry(node, x, y, precise)) return true;

  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (const child of children) {
      if (anyHit(child as NodeAny, x, y, precise)) return true;
    }
  }
  return false;
}

// Front-to-back DFS collecting every hit; shared by findGraphHitTargets(Precise).
function collectHits(node: NodeAny, x: number, y: number, precise: boolean, out: NodeAny[]): void {
  if (!node.enabled) return;

  const state = getNodeInteractionState(node);
  const enabled = state?.hitTestEnabled === true;
  const hitArea = state?.hitArea ?? null;

  if (enabled && hitArea !== null) {
    if (hitAreaContainsPoint(node, hitArea, x, y)) out.push(node);
    return;
  }

  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) collectHits(children[i] as NodeAny, x, y, precise, out);
  }

  if (enabled && testNodeGeometry(node, x, y, precise)) out.push(node);
}

// A single node's own-geometry test. Precise uses the kind's exact provider (hit iff >= 0) and falls
// back to the coarse bounds handler when no exact provider is registered — best-available precision.
function testNodeGeometry(node: NodeAny, x: number, y: number, precise: boolean): boolean {
  if (precise) {
    const exact = hitTestExactRegistry.get(node.kind);
    if (exact !== undefined) return exact(node, x, y) >= 0;
  }
  const coarse = hitTestRegistry.get(node.kind);
  return coarse ? coarse(node, x, y) : false;
}

// Resolves a `hitArea` region against world-space (x, y). Local-space forms (`'bounds'`, `Rectangle`,
// `Path`) map the point through the owning node's world matrix; a `Node` proxy is tested in the proxy's
// own world space via its coarse hit function. Union members are discriminated structurally: `'bounds'`
// is a string, a node carries `kind`, a path carries `commands`, otherwise it is a rectangle.
function hitAreaContainsPoint(node: NodeAny, hitArea: HitArea, x: number, y: number): boolean {
  if (hitArea === 'bounds') return hitTestGraphLocalBounds(node, x, y);

  if ('kind' in hitArea) {
    const proxy = hitArea as NodeAny;
    const proxyHit = hitTestRegistry.get(proxy.kind);
    return proxyHit ? proxyHit(proxy, x, y) : hitTestGraphLocalBounds(proxy, x, y);
  }

  inverseMatrixTransformPointXY(hitTestScratchPoint, getNodeWorldTransformMatrix(node as DisplayObject), x, y);
  const lx = hitTestScratchPoint.x;
  const ly = hitTestScratchPoint.y;
  if ('commands' in hitArea) return containsPathPoint(hitArea as Readonly<Path>, lx, ly);
  return containsRectanglePointXY(hitArea as Readonly<Rectangle>, lx, ly);
}

const hitTestScratchPoint = { x: 0, y: 0 };
const hitTestRegistry = new Map<Kind, HitTestFunction>();
const hitTestExactRegistry = new Map<Kind, HitTestPreciseFunction>();
