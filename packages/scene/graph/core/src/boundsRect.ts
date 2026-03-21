import { getRuntime } from '@flighthq/core';
import { matrix3x2, matrix3x2Pool, rectangle } from '@flighthq/geometry';
import type {
  GraphNode,
  GraphNodeRuntime,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Rectangle,
  RectangleLike,
} from '@flighthq/types';

import { getGraphNodeRuntime } from './graphNode';
import { getNumChildren, getParent } from './hierarchy';
import { ensureWorldTransform2D, getLocalTransform2D, getWorldTransform2D } from './transform2d';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function calculateBoundsRect<GraphKind extends symbol, Traits extends object>(
  out: RectangleLike,
  source: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  targetCoordinateSpace: (GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D) | null | undefined,
): void {
  if (!targetCoordinateSpace) targetCoordinateSpace = source;
  let bounds;
  if (getParent(targetCoordinateSpace) === null) {
    // if target has no parent, use world bounds
    bounds = getWorldBoundsRect(source);
  } else if (getNumChildren(source) === 0) {
    // only world bounds considers children
    if (targetCoordinateSpace === source) {
      // fast path, return local bounds for self
      bounds = getLocalBoundsRect(source);
    } else if (targetCoordinateSpace === getParent<GraphKind, Traits & HasBoundsRect & HasTransform2D>(source)) {
      // fast path, return bounds for parent
      bounds = getBoundsRect(source);
    }
  }
  if (!bounds) {
    // translate world bounds into target coordinate space
    const worldBounds = getWorldBoundsRect(source);
    const transform = matrix3x2Pool.get();
    matrix3x2.inverse(transform, getWorldTransform2D(targetCoordinateSpace));
    matrix3x2.transformRect(out, transform, worldBounds);
    matrix3x2Pool.release(transform);
  } else {
    rectangle.copy(out, bounds);
  }
}

export function ensureBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): void {
  const runtime = getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime;
  if (
    runtime.boundsUsingLocalBoundsID !== runtime.localBoundsID ||
    runtime.boundsUsingLocalTransformID !== runtime.localTransformID
  ) {
    recomputeBoundsRect(target, runtime);
  }
}

export function ensureLocalBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect,
): void {
  const runtime = getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime;
  if (runtime.localBoundsUsingLocalBoundsID !== runtime.localBoundsID) {
    recomputeLocalBoundsRect(target, runtime);
  }
}

export function ensureWorldBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): void {
  const runtime = getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> &
    HasBoundsRectRuntime &
    HasTransform2DRuntime;
  const localBoundsInvalid = runtime.worldBoundsUsingLocalBoundsID !== runtime.localBoundsID;
  const hasChildren = getNumChildren(target) !== 0;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRect(target, runtime)) return;
    forceRecompute = true;
  }
  ensureWorldTransform2D(target);
  if (forceRecompute || localBoundsInvalid || runtime.worldBoundsUsingWorldTransformID !== runtime.worldTransformID) {
    recomputeWorldBoundsRect(target, runtime);
  }
}

/**
 * localBoundsRect * localTransform
 */
export function getBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): Readonly<Rectangle> {
  ensureBoundsRect(target);
  return (getRuntime(target) as HasBoundsRectRuntime).boundsRect!;
}

/**
 * Object's own bounds (not including children)
 */
export function getLocalBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect,
): Readonly<Rectangle> {
  ensureLocalBoundsRect(target);
  return (getRuntime(target) as HasBoundsRectRuntime).localBoundsRect!;
}

/**
 * Object's bounds in world space (including children)
 */
export function getWorldBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): Readonly<Rectangle> {
  ensureWorldBoundsRect(target);
  return (getRuntime(target) as HasBoundsRectRuntime).worldBoundsRect!;
}

function recomputeBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime,
): void {
  if (runtime.boundsRect === null) runtime.boundsRect = rectangle.create();
  matrix3x2.transformRect(runtime.boundsRect, getLocalTransform2D(target), getLocalBoundsRect(target));
  runtime.boundsUsingLocalBoundsID = runtime.localBoundsID;
  runtime.boundsUsingLocalTransformID = runtime.localTransformID;
}

function recomputeLocalBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime,
): void {
  if (runtime.localBoundsRect === null) runtime.localBoundsRect = rectangle.create();
  runtime.computeLocalBoundsRect(runtime.localBoundsRect, target as GraphNode);
  runtime.localBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function recomputeWorldBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime & HasTransform2DRuntime,
) {
  if (runtime.worldBoundsRect === null) runtime.worldBoundsRect = rectangle.create();
  matrix3x2.transformRect(runtime.worldBoundsRect, getWorldTransform2D(target), getLocalBoundsRect(target));
  const children = getGraphNodeRuntime(target).children;
  if (children !== null) {
    for (const child of children) {
      const childWorldBounds = getWorldBoundsRect(
        child as GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
      );
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        rectangle.union(runtime.worldBoundsRect, runtime.worldBoundsRect, childWorldBounds);
      }
    }
  }
  runtime.worldBoundsUsingWorldTransformID = runtime.worldTransformID;
  runtime.worldBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function tryFastRecomputeWorldBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  runtime: HasBoundsRectRuntime & HasTransform2DRuntime,
): boolean {
  if (runtime.worldBoundsRect !== null && runtime.worldTransform2D !== null) {
    const { a: _a, b: _b, c: _c, d: _d, tx: _tx, ty: _ty } = runtime.worldTransform2D;
    ensureWorldTransform2D(target);
    const { a, b, c, d, tx, ty } = runtime.worldTransform2D;
    // check for unchanged rotation and scale
    if (a === _a && b === _b && c === _c && d === _d) {
      // offset only
      if (tx !== _tx || ty !== _ty) {
        runtime.worldBoundsRect.x += tx - _tx;
        runtime.worldBoundsRect.y += ty - _ty;
      }
      return true;
    }
  }
  return false;
}
