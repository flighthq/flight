import { matrix3x2, matrix3x2Pool, rectangle } from '@flighthq/geometry';
import type {
  GraphNode,
  GraphNodeRuntime,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Rectangle,
} from '@flighthq/types';

import { getHasBoundsRectRuntime } from './hasBoundsRect';
import { getRuntime } from './node';
import { ensureWorldTransform2D, getLocalTransform2D, getWorldTransform2D } from './transform2d';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function calculateBoundsRect<G extends symbol>(
  out: Rectangle,
  source: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
  targetCoordinateSpace: (GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>) | null | undefined,
): void {
  if (!targetCoordinateSpace) targetCoordinateSpace = source;
  let bounds;
  if (targetCoordinateSpace.parent === null) {
    // if target has no parent, use world bounds
    bounds = getWorldBoundsRect(source);
  } else if (source.children === null || source.children.length === 0) {
    // only world bounds considers children
    if (targetCoordinateSpace === source) {
      // fast path, return local bounds for self
      bounds = getLocalBoundsRect(source);
    } else if (targetCoordinateSpace === source.parent) {
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

export function ensureBoundsRect<G extends symbol>(target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>): void {
  const runtime = getHasBoundsRectRuntime(target);
  if (
    runtime.boundsUsingLocalBoundsID !== runtime.localBoundsID ||
    runtime.boundsUsingLocalTransformID !== runtime.localTransformID
  ) {
    recomputeBoundsRect(target, runtime);
  }
}

export function ensureLocalBoundsRect<G extends symbol>(target: GraphNode<G> & HasBoundsRect<G>): void {
  const runtime = getHasBoundsRectRuntime(target);
  if (runtime.localBoundsUsingLocalBoundsID !== runtime.localBoundsID) {
    recomputeLocalBoundsRect(target, runtime);
  }
}

export function ensureWorldBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
): void {
  const runtime = getRuntime(target) as GraphNodeRuntime<G> & HasBoundsRectRuntime<G> & HasTransform2DRuntime<G>;
  const localBoundsInvalid = runtime.worldBoundsUsingLocalBoundsID !== runtime.localBoundsID;
  const hasChildren = target.children !== null;
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
export function getBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
): Readonly<Rectangle> {
  ensureBoundsRect(target);
  return getHasBoundsRectRuntime(target).boundsRect!;
}

/**
 * Object's own bounds (not including children)
 */
export function getLocalBoundsRect<G extends symbol>(target: GraphNode<G> & HasBoundsRect<G>): Readonly<Rectangle> {
  ensureLocalBoundsRect(target);
  return getHasBoundsRectRuntime(target).localBoundsRect!;
}

/**
 * Object's bounds in world space (including children)
 */
export function getWorldBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
): Readonly<Rectangle> {
  ensureWorldBoundsRect(target);
  return getHasBoundsRectRuntime(target).worldBoundsRect!;
}

function recomputeBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
  runtime: HasBoundsRectRuntime<G>,
): void {
  if (runtime.boundsRect === null) runtime.boundsRect = rectangle.create();
  matrix3x2.transformRect(runtime.boundsRect, getLocalTransform2D(target), getLocalBoundsRect(target));
  runtime.boundsUsingLocalBoundsID = runtime.localBoundsID;
  runtime.boundsUsingLocalTransformID = runtime.localTransformID;
}

function recomputeLocalBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G>,
  runtime: HasBoundsRectRuntime<G>,
): void {
  if (runtime.localBoundsRect === null) runtime.localBoundsRect = rectangle.create();
  runtime.computeLocalBoundsRect(runtime.localBoundsRect, target);
  runtime.localBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function recomputeWorldBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
  runtime: HasBoundsRectRuntime<G> & HasTransform2DRuntime<G>,
) {
  if (runtime.worldBoundsRect === null) runtime.worldBoundsRect = rectangle.create();
  matrix3x2.transformRect(runtime.worldBoundsRect, getWorldTransform2D(target), getLocalBoundsRect(target));
  if (target.children !== null) {
    for (const child of target.children) {
      const childWorldBounds = getWorldBoundsRect(child as GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>);
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        rectangle.union(runtime.worldBoundsRect, runtime.worldBoundsRect, childWorldBounds);
      }
    }
  }
  runtime.worldBoundsUsingWorldTransformID = runtime.worldTransformID;
  runtime.worldBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function tryFastRecomputeWorldBoundsRect<G extends symbol>(
  target: GraphNode<G> & HasBoundsRect<G> & HasTransform2D<G>,
  runtime: HasBoundsRectRuntime<G> & HasTransform2DRuntime<G>,
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
