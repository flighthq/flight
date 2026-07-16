import { containsRectanglePointXY, intersectsRectangle, inverseMatrixTransformPointXY } from '@flighthq/geometry';
import {
  getNodeLocalBoundsRectangle,
  getNodeParent,
  getNodeRuntime,
  getNodeWorldBoundsRectangle,
  getNodeWorldTransformMatrix,
} from '@flighthq/node';
import type { DisplayObject, HitArea, HitTestFunction, Kind, Node, NodeAny } from '@flighthq/types';

import { getNodeInteractionState } from './nodeInteractionState';

/**
 * Walks the scene graph depth-first in reverse child order (front-to-back) and
 * returns the first node that registers a hit at the given world-space
 * coordinates, or null if nothing was hit.
 **/
export function findGraphHitTarget<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): Node<Traits> | null {
  if (!source.enabled) return null;

  // `interactionState` gates participation: `hitTestChildren` controls subtree descent,
  // `hitTestEnabled` controls self-hits, and `hitArea` swaps the self-hit geometry. An absent cell
  // means all defaults (fully hit-testable), so the common path pays only one null read.
  const state = getNodeInteractionState(source);

  if (state === null || state.hitTestChildren) {
    const children = getNodeRuntime(source).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        const hit = findGraphHitTarget(children[i], x, y, shapeFlag);
        if (hit !== null) return hit;
      }
    }
  }

  if ((state === null || state.hitTestEnabled) && testNodeSelfHit(source, x, y, shapeFlag, state?.hitArea ?? null)) {
    return source;
  }

  return null;
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
 * Evaluates the node to see if it or any of its descendants register a hit at
 * the given world-space coordinates.
 *
 * Traverses self first, then children in natural (back-to-front) order — the opposite of
 * `findGraphHitTarget` which tests children in reverse order (front-to-back) to find the
 * deepest topmost hit. This function answers "does anything hit?" rather than "which specific
 * node is hit?", so traversal order does not affect the boolean result.
 *
 * Hit behavior for a given node kind must be registered via `registerHitTest`.
 * Unregistered kinds are skipped for self-hit but children are still tested.
 *
 * @param shapeFlag Passed to the registered hit function; interpretation is kind-specific.
 **/
export function hitTestGraphPoint<Traits extends object>(
  source: Node<Traits>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): boolean {
  if (!source.enabled) return false;

  const state = getNodeInteractionState(source);

  if (
    (state === null || state.hitTestEnabled) &&
    testNodeSelfHit(source as NodeAny, x, y, shapeFlag, state?.hitArea ?? null)
  ) {
    return true;
  }

  if (state === null || state.hitTestChildren) {
    const children = getNodeRuntime(source).children;
    if (children !== null) {
      for (const child of children) {
        if (hitTestGraphPoint(child as Node<Traits>, x, y, shapeFlag)) return true;
      }
    }
  }

  return false;
}

/**
 * Registers an interaction handler for nodes of the given kind.
 * Call this once at startup to opt a node kind into interaction handling.
 **/
export function registerHitTestPoint(kind: Kind, fn: HitTestFunction): void {
  hitTestPointRegistry.set(kind, fn);
}

/**
 * Resolves a node's self-hit at world-space (x, y). With no `hitArea`, dispatches to the node's
 * kind-registered hit function. A `hitArea` proxy overrides own geometry: a `Rectangle` is tested by
 * world-space containment; a node proxy delegates to that node's own registered hit function (the
 * `'kind'` field is present on nodes and absent on rectangles, so it discriminates the union).
 **/
function testNodeSelfHit(source: NodeAny, x: number, y: number, shapeFlag: boolean, hitArea: HitArea | null): boolean {
  if (hitArea !== null) {
    if ('kind' in hitArea) {
      const proxyHit = hitTestPointRegistry.get(hitArea.kind);
      return proxyHit ? proxyHit(hitArea, x, y, shapeFlag) : false;
    }
    return containsRectanglePointXY(hitArea, x, y);
  }

  const hitTestSelf = hitTestPointRegistry.get(source.kind);
  return hitTestSelf ? hitTestSelf(source, x, y, shapeFlag) : false;
}

const hitTestLocalBoundsRectanglePoint = { x: 0, y: 0 };
const hitTestPointRegistry = new Map<Kind, HitTestFunction>();
