import { containsRectanglePointXY, intersectsRectangle, inverseMatrixTransformPointXY } from '@flighthq/geometry';
import {
  getGraphNodeRuntime,
  getGraphParent,
  getLocalBoundsRectangle,
  getWorldBoundsRectangle,
  getWorldTransformMatrix,
} from '@flighthq/scenegraph-core';
import type { DisplayObject, GraphNode, HitTestPoint } from '@flighthq/types';

/**
 * Walks the scene graph depth-first in reverse child order (front-to-back) and
 * returns the first node that registers a hit at the given world-space
 * coordinates, or null if nothing was hit.
 **/
export function findHitTarget(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): GraphNode<symbol, object> | null {
  if (!source.enabled) return null;

  const children = getGraphNodeRuntime(source).children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = findHitTarget(children[i] as GraphNode<symbol, object>, x, y, shapeFlag);
      if (hit !== null) return hit;
    }
  }

  const hitTestSelf = hitTestPointRegistry.get(source.kind);
  if (hitTestSelf?.(source, x, y, shapeFlag)) return source;

  return null;
}

/**
 * Tests whether world-space (x, y) falls within the node's local bounds rect,
 * after inverting through the node's world transform.
 **/
export function hitTestLocalBoundsRectangle(source: GraphNode<symbol, object>, x: number, y: number): boolean {
  inverseMatrixTransformPointXY(hitTestLocalBoundsRectPoint, getWorldTransformMatrix(source as DisplayObject), x, y);
  return containsRectanglePointXY(
    getLocalBoundsRectangle(source as DisplayObject),
    hitTestLocalBoundsRectPoint.x,
    hitTestLocalBoundsRectPoint.y,
  );
}

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
 **/
export function hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
  if (getGraphParent(source) !== null && getGraphParent(other) !== null) {
    return intersectsRectangle(getWorldBoundsRectangle(source), getWorldBoundsRectangle(other));
  }
  return false;
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
export function hitTestPoint<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits>,
  x: number,
  y: number,
  shapeFlag: boolean = false,
): boolean {
  if (!source.enabled) return false;

  const hitTestSelf = hitTestPointRegistry.get(source.kind);
  if (hitTestSelf?.(source as GraphNode<symbol, object>, x, y, shapeFlag)) return true;

  const children = getGraphNodeRuntime(source).children;
  if (children !== null) {
    for (const child of children) {
      if (hitTestPoint(child as GraphNode<GraphKind, Traits>, x, y, shapeFlag)) return true;
    }
  }

  return false;
}

/**
 * Registers an interaction handler for nodes of the given kind.
 * Call this once at startup to opt a node kind into interaction handling.
 **/
export function registerHitTestPoint(kind: symbol, fn: HitTestPoint): void {
  hitTestPointRegistry.set(kind, fn);
}

const hitTestLocalBoundsRectPoint = { x: 0, y: 0 };
const hitTestPointRegistry = new Map<symbol, HitTestPoint>();
