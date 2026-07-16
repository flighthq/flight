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
  HitTestDetailedFunction,
  HitTestFunction,
  HitTestResult,
  Kind,
  Node,
  NodeAny,
  Path,
  Rectangle,
} from '@flighthq/types';

import { getNodeInteractionState } from './nodeInteractionState';

/**
 * Tier-1 pick. Walks the graph depth-first, front-to-back (reverse child order), and returns the first
 * node that registers a hit at world-space (x, y), or null.
 *
 * Eligibility is opt-in: a node is a self-hit candidate only when `hitTestEnabled` is set (default off),
 * so decorative nodes are transparent for free. A candidate with a `hitArea` is an **atomic unit** — it
 * consumes the hit and its children are not descended (they are part of the unit). Recursion into
 * children is not gated by the parent's own eligibility, so an inert container still exposes its
 * interactive children. Coarse only: no shape/pixel math runs here — use `findGraphHitTargetDetailed`.
 **/
export function findGraphHitTarget<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): Node<Traits> | null {
  if (!source.enabled) return null;

  const state = getNodeInteractionState(source);
  const enabled = state?.hitTestEnabled === true;
  const hitArea = state?.hitArea ?? null;

  // Atomic unit: an enabled node with a hitArea consumes the hit and hides its interior.
  if (enabled && hitArea !== null) {
    return hitAreaContainsPoint(source as NodeAny, hitArea, x, y, shapeFlag) ? source : null;
  }

  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = findGraphHitTarget(children[i], x, y, shapeFlag);
      if (hit !== null) return hit;
    }
  }

  if (enabled) {
    const hitTestSelf = hitTestPointRegistry.get(source.kind);
    if (hitTestSelf?.(source as NodeAny, x, y, shapeFlag)) return source;
  }

  return null;
}

/**
 * Tier-2 refine. Finds the deepest eligible node at world-space (x, y) — **piercing** an atomic
 * `hitArea` unit to report the real child inside it — and fills `out` with that node, the hit point in
 * its local space, and a sub-index resolved via `registerHitTestDetailed` (tile/quad/glyph index, else
 * -1). Defaults `shapeFlag` to true so per-kind shape-accurate tests run. This is the explicit,
 * pay-for-precision call; the coarse hot path (`findGraphHitTarget`) never runs it.
 **/
export function findGraphHitTargetDetailed<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  out: HitTestResult,
  shapeFlag: boolean = true,
): HitTestResult | null {
  const node = findDetailedHitNode(source as NodeAny, x, y, shapeFlag);
  if (node === null) return null;

  out.node = node;
  inverseMatrixTransformPointXY(
    hitTestLocalBoundsRectanglePoint,
    getNodeWorldTransformMatrix(node as DisplayObject),
    x,
    y,
  );
  out.localX = hitTestLocalBoundsRectanglePoint.x;
  out.localY = hitTestLocalBoundsRectanglePoint.y;
  const detailed = hitTestDetailedRegistry.get(node.kind);
  out.subIndex = detailed ? detailed(node, x, y, shapeFlag) : -1;
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
  inverseMatrixTransformPointXY(
    hitTestLocalBoundsRectanglePoint,
    getNodeWorldTransformMatrix(source as DisplayObject),
    x,
    y,
  );
  return containsRectanglePointXY(
    getNodeLocalBoundsRectangle(source as DisplayObject),
    hitTestLocalBoundsRectanglePoint.x,
    hitTestLocalBoundsRectanglePoint.y,
  );
}

/**
 * Tier-1 any-hit query: whether the node or any descendant registers a hit at world-space (x, y).
 * Same opt-in eligibility and atomic-`hitArea` rules as `findGraphHitTarget`; traversal order does not
 * affect a boolean result.
 **/
export function hitTestGraphPoint<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): boolean {
  if (!source.enabled) return false;

  const state = getNodeInteractionState(source);
  const enabled = state?.hitTestEnabled === true;
  const hitArea = state?.hitArea ?? null;

  if (enabled && hitArea !== null) {
    return hitAreaContainsPoint(source as NodeAny, hitArea, x, y, shapeFlag);
  }

  if (enabled) {
    const hitTestSelf = hitTestPointRegistry.get(source.kind);
    if (hitTestSelf?.(source as NodeAny, x, y, shapeFlag)) return true;
  }

  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (const child of children) {
      if (hitTestGraphPoint(child as Node<Traits>, x, y, shapeFlag)) return true;
    }
  }

  return false;
}

/**
 * Tests one node's own hit region at world-space (x, y): its `hitArea` if set, else its kind-registered
 * geometry. No eligibility check and no recursion — for callers (e.g. the broadphase) that already hold
 * an eligible, atomic candidate and need only the precise per-node test.
 **/
export function hitTestNodeRegion(source: NodeAny, x: number, y: number, shapeFlag: boolean = false): boolean {
  const hitArea = getNodeInteractionState(source)?.hitArea ?? null;
  if (hitArea !== null) return hitAreaContainsPoint(source, hitArea, x, y, shapeFlag);
  const hitTestSelf = hitTestPointRegistry.get(source.kind);
  return hitTestSelf ? hitTestSelf(source, x, y, shapeFlag) : false;
}

/**
 * Registers the Tier-2 sub-index resolver for a node kind (tilemap tile, quad index, glyph). Consulted
 * only by `findGraphHitTargetDetailed`; opt-in per kind so the coarse path never carries the cost.
 **/
export function registerHitTestDetailed(kind: Kind, fn: HitTestDetailedFunction): void {
  hitTestDetailedRegistry.set(kind, fn);
}

/**
 * Registers the Tier-1 point hit function for a node kind.
 * Call this once at startup to give a node kind coarse hit geometry.
 **/
export function registerHitTestPoint(kind: Kind, fn: HitTestFunction): void {
  hitTestPointRegistry.set(kind, fn);
}

// Resolves a `hitArea` region against world-space (x, y). Local-space forms (`'bounds'`, `Rectangle`,
// `Path`) map the point through the owning node's world matrix; a `Node` proxy is tested in the proxy's
// own world space via its registered hit function. Union members are discriminated structurally:
// `'bounds'` is a string, a node carries `kind`, a path carries `commands`, otherwise it is a rectangle.
function hitAreaContainsPoint(node: NodeAny, hitArea: HitArea, x: number, y: number, shapeFlag: boolean): boolean {
  if (hitArea === 'bounds') return hitTestGraphLocalBounds(node, x, y);

  if ('kind' in hitArea) {
    const proxy = hitArea as NodeAny;
    const proxyHit = hitTestPointRegistry.get(proxy.kind);
    return proxyHit ? proxyHit(proxy, x, y, shapeFlag) : hitTestGraphLocalBounds(proxy, x, y);
  }

  inverseMatrixTransformPointXY(
    hitTestLocalBoundsRectanglePoint,
    getNodeWorldTransformMatrix(node as DisplayObject),
    x,
    y,
  );
  const lx = hitTestLocalBoundsRectanglePoint.x;
  const ly = hitTestLocalBoundsRectanglePoint.y;
  if ('commands' in hitArea) return containsPathPoint(hitArea as Readonly<Path>, lx, ly);
  return containsRectanglePointXY(hitArea as Readonly<Rectangle>, lx, ly);
}

// Tier-2 walk: deepest eligible node front-to-back, descending through atomic units so a registered
// child inside a `hitArea` unit is reported instead of the unit. Falls back to the unit itself when no
// deeper candidate is hit.
function findDetailedHitNode(source: NodeAny, x: number, y: number, shapeFlag: boolean): NodeAny | null {
  if (!source.enabled) return null;

  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = findDetailedHitNode(children[i] as NodeAny, x, y, shapeFlag);
      if (hit !== null) return hit;
    }
  }

  const state = getNodeInteractionState(source);
  if (state?.hitTestEnabled === true) {
    const hitArea = state.hitArea;
    if (hitArea !== null) {
      if (hitAreaContainsPoint(source, hitArea, x, y, shapeFlag)) return source;
    } else {
      const hitTestSelf = hitTestPointRegistry.get(source.kind);
      if (hitTestSelf?.(source, x, y, shapeFlag)) return source;
    }
  }

  return null;
}

const hitTestLocalBoundsRectanglePoint = { x: 0, y: 0 };
const hitTestDetailedRegistry = new Map<Kind, HitTestDetailedFunction>();
const hitTestPointRegistry = new Map<Kind, HitTestFunction>();
