import { containsRectanglePointXY, intersectsRectangle, inverseMatrixTransformPointXY } from '@flighthq/geometry';
import {
  getNodeLocalBoundsRectangle,
  getNodeParent,
  getNodeRuntime,
  getNodeWorldBoundsRectangle,
  getNodeWorldTransformMatrix,
} from '@flighthq/node';
import type { DisplayObject, GraphHitTestFunction, Node } from '@flighthq/types';

/**
 * Walks the scene graph depth-first in reverse child order (front-to-back) and
 * returns the first node that registers a hit at the given world-space
 * coordinates, or null if nothing was hit.
 **/
export function findGraphHitTarget(
  source: Node<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): Node<symbol, object> | null {
  if (!source.enabled) return null;

  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = findGraphHitTarget(children[i] as Node<symbol, object>, x, y, shapeFlag);
      if (hit !== null) return hit;
    }
  }

  const hitTestSelf = hitTestPointRegistry.get(source.kind);
  if (hitTestSelf?.(source, x, y, shapeFlag)) return source;

  return null;
}

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
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
export function hitTestGraphLocalBounds(source: Node<symbol, object>, x: number, y: number): boolean {
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
 * Hit behavior for a given node kind must be registered via `registerHitTest`.
 * Unregistered kinds are skipped for self-hit but children are still tested.
 *
 * @param shapeFlag Passed to the registered hit function; interpretation is kind-specific.
 **/
export function hitTestGraphPoint<Kind extends symbol, Traits extends object>(
  source: Node<Kind, Traits>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): boolean {
  if (!source.enabled) return false;

  const hitTestSelf = hitTestPointRegistry.get(source.kind);
  if (hitTestSelf?.(source as Node<symbol, object>, x, y, shapeFlag)) return true;

  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (const child of children) {
      if (hitTestGraphPoint(child as Node<Kind, Traits>, x, y, shapeFlag)) return true;
    }
  }

  return false;
}

/**
 * Registers an interaction handler for nodes of the given kind.
 * Call this once at startup to opt a node kind into interaction handling.
 **/
export function registerHitTestPoint(kind: symbol, fn: GraphHitTestFunction): void {
  hitTestPointRegistry.set(kind, fn);
}

const hitTestLocalBoundsRectanglePoint = { x: 0, y: 0 };
const hitTestPointRegistry = new Map<symbol, GraphHitTestFunction>();
