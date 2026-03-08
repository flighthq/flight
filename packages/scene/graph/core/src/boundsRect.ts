import { matrix3x2, matrix3x2Pool, rectangle } from '@flighthq/geometry';
import { ensureWorldTransform, getLocalTransform, getRuntime, getWorldTransform } from '@flighthq/scene-graph-core';
import type { BoundsRectRuntime, HasBoundsRect, HasTransform2D, SceneNode, Transform2DRuntime } from '@flighthq/types';
import type { Rectangle } from '@flighthq/types';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function calculateBoundsRect<K extends symbol>(
  out: Rectangle,
  source: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
  targetCoordinateSpace: (SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>) | null | undefined,
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
    matrix3x2.inverse(transform, getWorldTransform(targetCoordinateSpace));
    matrix3x2.transformRect(out, transform, worldBounds);
    matrix3x2Pool.release(transform);
  } else {
    rectangle.copy(out, bounds);
  }
}

export function ensureBoundsRect<K extends symbol>(target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>): void {
  const runtime = getRuntime(target) as BoundsRectRuntime<K>;
  if (
    runtime.boundsRectUsingLocalBoundsID !== runtime.localBoundsID ||
    runtime.boundsRectUsingLocalTransformID !== runtime.localTransformID
  ) {
    recomputeBoundsRect(target, runtime);
  }
}

export function ensureLocalBoundsRect<K extends symbol>(target: SceneNode<K> & HasBoundsRect<K>): void {
  const runtime = getRuntime(target) as BoundsRectRuntime<K>;
  if (runtime.localBoundsRectUsingLocalBoundsID !== runtime.localBoundsID) {
    recomputeLocalBoundsRect(target, runtime);
  }
}

export function ensureWorldBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
): void {
  const runtime = getRuntime(target) as BoundsRectRuntime<K> & Transform2DRuntime<K>;
  const localBoundsInvalid = runtime.worldBoundsRectUsingLocalBoundsID !== runtime.localBoundsID;
  const hasChildren = target.children !== null;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRect(target, runtime)) return;
    forceRecompute = true;
  }
  ensureWorldTransform(target);
  if (
    forceRecompute ||
    localBoundsInvalid ||
    runtime.worldBoundsRectUsingWorldTransformID !== runtime.worldTransformID
  ) {
    recomputeWorldBoundsRect(target, runtime);
  }
}

/**
 * localBoundsRect * localTransform
 */
export function getBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
): Readonly<Rectangle> {
  ensureBoundsRect(target);
  return (getRuntime(target) as BoundsRectRuntime<K>).boundsRect!;
}

/**
 * Object's own bounds (not including children)
 */
export function getLocalBoundsRect<K extends symbol>(target: SceneNode<K> & HasBoundsRect<K>): Readonly<Rectangle> {
  ensureLocalBoundsRect(target);
  return (getRuntime(target) as BoundsRectRuntime<K>).localBoundsRect!;
}

/**
 * Object's bounds in world space (including children)
 */
export function getWorldBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
): Readonly<Rectangle> {
  ensureWorldBoundsRect(target);
  return (getRuntime(target) as BoundsRectRuntime<K>).worldBoundsRect!;
}

function recomputeBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
  runtime: BoundsRectRuntime<K>,
): void {
  if (runtime.boundsRect === null) runtime.boundsRect = rectangle.create();
  matrix3x2.transformRect(runtime.boundsRect, getLocalTransform(target), getLocalBoundsRect(target));
  runtime.boundsRectUsingLocalBoundsID = runtime.localBoundsID;
  runtime.boundsRectUsingLocalTransformID = runtime.localTransformID;
}

function recomputeLocalBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K>,
  runtime: BoundsRectRuntime<K>,
): void {
  if (runtime.localBoundsRect === null) runtime.localBoundsRect = rectangle.create();
  runtime.computeLocalBounds(runtime.localBoundsRect, target);
  runtime.localBoundsRectUsingLocalBoundsID = runtime.localBoundsID;
}

function recomputeWorldBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
  runtime: BoundsRectRuntime<K> & Transform2DRuntime<K>,
) {
  if (runtime.worldBoundsRect === null) runtime.worldBoundsRect = rectangle.create();
  matrix3x2.transformRect(runtime.worldBoundsRect, getWorldTransform(target), getLocalBoundsRect(target));
  if (target.children !== null) {
    for (const child of target.children) {
      const childWorldBounds = getWorldBoundsRect(child as SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>);
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        rectangle.union(runtime.worldBoundsRect, runtime.worldBoundsRect, childWorldBounds);
      }
    }
  }
  runtime.worldBoundsRectUsingWorldTransformID = runtime.worldTransformID;
  runtime.worldBoundsRectUsingLocalBoundsID = runtime.localBoundsID;
}

function tryFastRecomputeWorldBoundsRect<K extends symbol>(
  target: SceneNode<K> & HasBoundsRect<K> & HasTransform2D<K>,
  runtime: BoundsRectRuntime<K> & Transform2DRuntime<K>,
): boolean {
  if (runtime.worldBoundsRect !== null && runtime.worldTransform !== null) {
    const { a: _a, b: _b, c: _c, d: _d, tx: _tx, ty: _ty } = runtime.worldTransform;
    ensureWorldTransform(target);
    const { a, b, c, d, tx, ty } = runtime.worldTransform;
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
