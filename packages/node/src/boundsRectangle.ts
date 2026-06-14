import { getEntityRuntime } from '@flighthq/entity';
import {
  acquireMatrix,
  copyRectangle,
  createRectangle,
  inverseMatrix,
  matrixTransformRectangle,
  mergeRectangle,
  releaseMatrix,
} from '@flighthq/geometry';
import type {
  BoundsNode,
  HasBoundsRectangleRuntime,
  HasTransform2DRuntime,
  NodeRuntime,
  Rectangle,
  RectangleLike,
  Spatial2DNode,
} from '@flighthq/types';

import { getNodeChildCount, getNodeParent } from './hierarchy';
import { getNodeRuntime } from './node';
import { invalidateNodeLocalTransform } from './revision';
import {
  ensureNodeWorldTransformMatrix,
  getNodeLocalTransformMatrix,
  getNodeWorldTransformMatrix,
} from './transform2d';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function computeNodeBoundsRectangle<Kind extends symbol, Traits extends object>(
  out: RectangleLike,
  source: Spatial2DNode<Kind, Traits>,
  targetCoordinateSpace: Spatial2DNode<Kind, Traits> | null | undefined,
): void {
  if (!targetCoordinateSpace) targetCoordinateSpace = source;
  let bounds;
  if (getNodeParent(targetCoordinateSpace) === null) {
    // if target has no parent, use world bounds
    bounds = getNodeWorldBoundsRectangle(source);
  } else if (getNodeChildCount(source) === 0) {
    // only world bounds considers children
    if (targetCoordinateSpace === source) {
      // fast path, return local bounds for self
      bounds = getNodeLocalBoundsRectangle(source);
    } else if (targetCoordinateSpace === (getNodeParent(source) as Spatial2DNode<Kind, Traits> | null)) {
      // fast path, return bounds for parent
      bounds = getNodeParentBoundsRectangle(source);
    }
  }
  if (!bounds) {
    // translate world bounds into target coordinate space
    const worldBounds = getNodeWorldBoundsRectangle(source);
    const transform = acquireMatrix();
    inverseMatrix(transform, getNodeWorldTransformMatrix(targetCoordinateSpace));
    matrixTransformRectangle(out, transform, worldBounds);
    releaseMatrix(transform);
  } else {
    copyRectangle(out, bounds);
  }
}

export function ensureNodeLocalBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: BoundsNode<Kind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Kind, Traits> & HasBoundsRectangleRuntime;
  if (runtime.localBoundsUsingLocalBoundsID !== runtime.localBoundsID) {
    recomputeLocalBoundsRectangle(target, runtime);
  }
}

export function ensureNodeParentBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Kind, Traits> & HasBoundsRectangleRuntime;
  if (
    runtime.boundsUsingLocalBoundsID !== runtime.localBoundsID ||
    runtime.boundsUsingLocalTransformID !== runtime.localTransformID
  ) {
    recomputeNodeBoundsRectangle(target, runtime);
  }
}

export function ensureNodeWorldBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Kind, Traits> &
    HasBoundsRectangleRuntime &
    HasTransform2DRuntime;
  const localBoundsInvalid = runtime.worldBoundsUsingLocalBoundsID !== runtime.localBoundsID;
  const hasChildren = getNodeChildCount(target) !== 0;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRectangle(target, runtime)) return;
    forceRecompute = true;
  }
  ensureNodeWorldTransformMatrix(target);
  if (forceRecompute || localBoundsInvalid || runtime.worldBoundsUsingWorldTransformID !== runtime.worldTransformID) {
    recomputeWorldBoundsRectangle(target, runtime);
  }
}

export function getNodeHeight<Kind extends symbol, Traits extends object>(source: Spatial2DNode<Kind, Traits>): number {
  computeNodeBoundsRectangle(
    _tempBoundsRectangle,
    source,
    getNodeParent(source) as unknown as Spatial2DNode<Kind, Traits> | null,
  );
  return _tempBoundsRectangle.height;
}

/**
 * Object's own bounds (not including children)
 */
export function getNodeLocalBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: BoundsNode<Kind, Traits>,
): Readonly<Rectangle> {
  ensureNodeLocalBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).localBoundsRectangle!;
}

/**
 * localBoundsRectangle * localTransform
 */
export function getNodeParentBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
): Readonly<Rectangle> {
  ensureNodeParentBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).boundsRectangle!;
}

export function getNodeWidth<Kind extends symbol, Traits extends object>(source: Spatial2DNode<Kind, Traits>): number {
  computeNodeBoundsRectangle(
    _tempBoundsRectangle,
    source,
    getNodeParent(source) as unknown as Spatial2DNode<Kind, Traits> | null,
  );
  return _tempBoundsRectangle.width;
}

/**
 * Object's bounds in world space (including children)
 */
export function getNodeWorldBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
): Readonly<Rectangle> {
  ensureNodeWorldBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).worldBoundsRectangle!;
}

export function setNodeHeight<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
  value: number,
): void {
  if (target.scaleY === 0) return;
  target.scaleY = (value * target.scaleY) / getNodeHeight(target);
  invalidateNodeLocalTransform(target);
}

export function setNodeWidth<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
  value: number,
): void {
  if (target.scaleX === 0) return;
  target.scaleX = (value * target.scaleX) / getNodeWidth(target);
  invalidateNodeLocalTransform(target);
}

function recomputeNodeBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
  runtime: NodeRuntime<Kind, Traits> & HasBoundsRectangleRuntime,
): void {
  if (runtime.boundsRectangle === null) runtime.boundsRectangle = createRectangle();
  matrixTransformRectangle(
    runtime.boundsRectangle,
    getNodeLocalTransformMatrix(target),
    getNodeLocalBoundsRectangle(target),
  );
  runtime.boundsUsingLocalBoundsID = runtime.localBoundsID;
  runtime.boundsUsingLocalTransformID = runtime.localTransformID;
}

function recomputeLocalBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: BoundsNode<Kind, Traits>,
  runtime: NodeRuntime<Kind, Traits> & HasBoundsRectangleRuntime,
): void {
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  runtime.computeLocalBoundsRectangle(runtime.localBoundsRectangle, target);
  runtime.localBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function recomputeWorldBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
  runtime: NodeRuntime<Kind, Traits> & HasBoundsRectangleRuntime & HasTransform2DRuntime,
) {
  if (runtime.worldBoundsRectangle === null) runtime.worldBoundsRectangle = createRectangle();
  matrixTransformRectangle(
    runtime.worldBoundsRectangle,
    getNodeWorldTransformMatrix(target),
    getNodeLocalBoundsRectangle(target),
  );
  const children = getNodeRuntime(target).children;
  if (children !== null) {
    for (const child of children) {
      if (!child.enabled) continue;
      const childWorldBounds = getNodeWorldBoundsRectangle(child as Spatial2DNode<Kind, Traits>);
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        mergeRectangle(runtime.worldBoundsRectangle, runtime.worldBoundsRectangle, childWorldBounds);
      }
    }
  }
  runtime.worldBoundsUsingWorldTransformID = runtime.worldTransformID;
  runtime.worldBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function tryFastRecomputeWorldBoundsRectangle<Kind extends symbol, Traits extends object>(
  target: Spatial2DNode<Kind, Traits>,
  runtime: HasBoundsRectangleRuntime & HasTransform2DRuntime,
): boolean {
  if (runtime.worldBoundsRectangle !== null && runtime.worldTransform2D !== null) {
    const { a: _a, b: _b, c: _c, d: _d, tx: _tx, ty: _ty } = runtime.worldTransform2D;
    ensureNodeWorldTransformMatrix(target);
    const { a, b, c, d, tx, ty } = runtime.worldTransform2D;
    // check for unchanged rotation and scale
    if (a === _a && b === _b && c === _c && d === _d) {
      // offset only
      if (tx !== _tx || ty !== _ty) {
        runtime.worldBoundsRectangle.x += tx - _tx;
        runtime.worldBoundsRectangle.y += ty - _ty;
      }
      return true;
    }
  }
  return false;
}

const _tempBoundsRectangle = createRectangle();
