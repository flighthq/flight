import { getEntityRuntime } from '@flighthq/entity';
import {
  copyRectangle,
  createRectangle,
  inverseMatrix,
  matrixTransformRectangle,
  unionRectangle,
} from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
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
import { getGraphNumChildren, getGraphParent } from './hierarchy';
import { invalidateLocalTransform } from './revision';
import { ensureWorldTransformMatrix, getLocalTransformMatrix, getWorldTransformMatrix } from './transform2d';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function calculateBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  out: RectangleLike,
  source: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  targetCoordinateSpace: (GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D) | null | undefined,
): void {
  if (!targetCoordinateSpace) targetCoordinateSpace = source;
  let bounds;
  if (getGraphParent(targetCoordinateSpace) === null) {
    // if target has no parent, use world bounds
    bounds = getWorldBoundsRectangle(source);
  } else if (getGraphNumChildren(source) === 0) {
    // only world bounds considers children
    if (targetCoordinateSpace === source) {
      // fast path, return local bounds for self
      bounds = getLocalBoundsRectangle(source);
    } else if (targetCoordinateSpace === getGraphParent<GraphKind, Traits & HasBoundsRect & HasTransform2D>(source)) {
      // fast path, return bounds for parent
      bounds = getBoundsRectangle(source);
    }
  }
  if (!bounds) {
    // translate world bounds into target coordinate space
    const worldBounds = getWorldBoundsRectangle(source);
    const transform = acquireMatrix();
    inverseMatrix(transform, getWorldTransformMatrix(targetCoordinateSpace));
    matrixTransformRectangle(out, transform, worldBounds);
    releaseMatrix(transform);
  } else {
    copyRectangle(out, bounds);
  }
}

export function ensureBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): void {
  const runtime = getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime;
  if (
    runtime.boundsUsingLocalBoundsID !== runtime.localBoundsID ||
    runtime.boundsUsingLocalTransformID !== runtime.localTransformID
  ) {
    recomputeBoundsRect(target, runtime);
  }
}

export function ensureLocalBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect,
): void {
  const runtime = getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime;
  if (runtime.localBoundsUsingLocalBoundsID !== runtime.localBoundsID) {
    recomputeLocalBoundsRect(target, runtime);
  }
}

export function ensureWorldBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): void {
  const runtime = getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> &
    HasBoundsRectRuntime &
    HasTransform2DRuntime;
  const localBoundsInvalid = runtime.worldBoundsUsingLocalBoundsID !== runtime.localBoundsID;
  const hasChildren = getGraphNumChildren(target) !== 0;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRect(target, runtime)) return;
    forceRecompute = true;
  }
  ensureWorldTransformMatrix(target);
  if (forceRecompute || localBoundsInvalid || runtime.worldBoundsUsingWorldTransformID !== runtime.worldTransformID) {
    recomputeWorldBoundsRect(target, runtime);
  }
}

/**
 * localBoundsRect * localTransform
 */
export function getBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): Readonly<Rectangle> {
  ensureBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectRuntime).boundsRect!;
}

/**
 * Object's own bounds (not including children)
 */
export function getLocalBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect,
): Readonly<Rectangle> {
  ensureLocalBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectRuntime).localBoundsRect!;
}

export function getScaledBoundsHeight<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): number {
  calculateBoundsRectangle(
    _tempBoundsRect,
    source,
    getGraphParent(source) as (GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D) | null,
  );
  return _tempBoundsRect.height;
}

export function getScaledBoundsWidth<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): number {
  calculateBoundsRectangle(
    _tempBoundsRect,
    source,
    getGraphParent(source) as (GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D) | null,
  );
  return _tempBoundsRect.width;
}

/**
 * Object's bounds in world space (including children)
 */
export function getWorldBoundsRectangle<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
): Readonly<Rectangle> {
  ensureWorldBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectRuntime).worldBoundsRect!;
}

export function setScaledBoundsHeight<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  value: number,
): void {
  if (source.scaleY === 0) return;
  source.scaleY = (value * source.scaleY) / getScaledBoundsHeight(source);
  invalidateLocalTransform(source);
}

export function setScaledBoundsWidth<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  value: number,
): void {
  if (source.scaleX === 0) return;
  source.scaleX = (value * source.scaleX) / getScaledBoundsWidth(source);
  invalidateLocalTransform(source);
}

function recomputeBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime,
): void {
  if (runtime.boundsRect === null) runtime.boundsRect = createRectangle();
  matrixTransformRectangle(runtime.boundsRect, getLocalTransformMatrix(target), getLocalBoundsRectangle(target));
  runtime.boundsUsingLocalBoundsID = runtime.localBoundsID;
  runtime.boundsUsingLocalTransformID = runtime.localTransformID;
}

function recomputeLocalBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime,
): void {
  if (runtime.localBoundsRect === null) runtime.localBoundsRect = createRectangle();
  runtime.computeLocalBoundsRect(runtime.localBoundsRect, target as GraphNode);
  runtime.localBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function recomputeWorldBoundsRect<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasBoundsRectRuntime & HasTransform2DRuntime,
) {
  if (runtime.worldBoundsRect === null) runtime.worldBoundsRect = createRectangle();
  matrixTransformRectangle(runtime.worldBoundsRect, getWorldTransformMatrix(target), getLocalBoundsRectangle(target));
  const children = getGraphNodeRuntime(target).children;
  if (children !== null) {
    for (const child of children) {
      if (!child.enabled) continue;
      const childWorldBounds = getWorldBoundsRectangle(
        child as GraphNode<GraphKind, Traits> & HasBoundsRect & HasTransform2D,
      );
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        unionRectangle(runtime.worldBoundsRect, runtime.worldBoundsRect, childWorldBounds);
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
    ensureWorldTransformMatrix(target);
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

const _tempBoundsRect = createRectangle();
