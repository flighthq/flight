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
import { ensureNodeWorldMatrix, getNodeLocalMatrix, getNodeWorldMatrix } from './nodeTransform2d';
import { invalidateNodeLocalTransform } from './revision';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function computeNodeBoundsRectangle<Traits extends object>(
  out: RectangleLike,
  source: Spatial2DNode<Traits>,
  targetCoordinateSpace: Spatial2DNode<Traits> | null | undefined,
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
    } else if (targetCoordinateSpace === (getNodeParent(source) as Spatial2DNode<Traits> | null)) {
      // fast path, return bounds for parent
      bounds = getNodeParentBoundsRectangle(source);
    }
  }
  if (!bounds) {
    // translate world bounds into target coordinate space
    const worldBounds = getNodeWorldBoundsRectangle(source);
    const transform = acquireMatrix();
    inverseMatrix(transform, getNodeWorldMatrix(targetCoordinateSpace));
    matrixTransformRectangle(out, transform, worldBounds);
    releaseMatrix(transform);
  } else {
    copyRectangle(out, bounds);
  }
}

export function ensureNodeLocalBoundsRectangle<Traits extends object>(target: BoundsNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasBoundsRectangleRuntime;
  if (runtime.localBoundsUsingLocalBoundsId !== runtime.localBoundsId) {
    recomputeLocalBoundsRectangle(target, runtime);
  }
}

export function ensureNodeParentBoundsRectangle<Traits extends object>(target: Spatial2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasBoundsRectangleRuntime;
  if (
    runtime.boundsUsingLocalBoundsId !== runtime.localBoundsId ||
    runtime.boundsUsingLocalTransformId !== runtime.localTransformId
  ) {
    recomputeNodeBoundsRectangle(target, runtime);
  }
}

export function ensureNodeWorldBoundsRectangle<Traits extends object>(target: Spatial2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasBoundsRectangleRuntime & HasTransform2DRuntime;
  const localBoundsInvalid = runtime.worldBoundsUsingLocalBoundsId !== runtime.localBoundsId;
  const hasChildren = getNodeChildCount(target) !== 0;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRectangle(target, runtime)) return;
    forceRecompute = true;
  }
  ensureNodeWorldMatrix(target);
  if (forceRecompute || localBoundsInvalid || runtime.worldBoundsUsingWorldTransformId !== runtime.worldTransformId) {
    recomputeWorldBoundsRectangle(target, runtime);
  }
}

export function getNodeHeight<Traits extends object>(source: Spatial2DNode<Traits>): number {
  computeNodeBoundsRectangle(
    _tempBoundsRectangle,
    source,
    getNodeParent(source) as unknown as Spatial2DNode<Traits> | null,
  );
  return _tempBoundsRectangle.height;
}

/**
 * Object's own bounds (not including children)
 */
export function getNodeLocalBoundsRectangle<Traits extends object>(target: BoundsNode<Traits>): Readonly<Rectangle> {
  ensureNodeLocalBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).localBoundsRectangle!;
}

/**
 * localBoundsRectangle * localTransform
 */
export function getNodeParentBoundsRectangle<Traits extends object>(
  target: Spatial2DNode<Traits>,
): Readonly<Rectangle> {
  ensureNodeParentBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).boundsRectangle!;
}

export function getNodeWidth<Traits extends object>(source: Spatial2DNode<Traits>): number {
  computeNodeBoundsRectangle(
    _tempBoundsRectangle,
    source,
    getNodeParent(source) as unknown as Spatial2DNode<Traits> | null,
  );
  return _tempBoundsRectangle.width;
}

/**
 * Object's bounds in world space (including children)
 */
export function getNodeWorldBoundsRectangle<Traits extends object>(target: Spatial2DNode<Traits>): Readonly<Rectangle> {
  ensureNodeWorldBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).worldBoundsRectangle!;
}

export function setNodeHeight<Traits extends object>(target: Spatial2DNode<Traits>, value: number): void {
  if (target.scaleY === 0) return;
  target.scaleY = (value * target.scaleY) / getNodeHeight(target);
  invalidateNodeLocalTransform(target);
}

export function setNodeWidth<Traits extends object>(target: Spatial2DNode<Traits>, value: number): void {
  if (target.scaleX === 0) return;
  target.scaleX = (value * target.scaleX) / getNodeWidth(target);
  invalidateNodeLocalTransform(target);
}

function recomputeNodeBoundsRectangle<Traits extends object>(
  target: Spatial2DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasBoundsRectangleRuntime,
): void {
  if (runtime.boundsRectangle === null) runtime.boundsRectangle = createRectangle();
  matrixTransformRectangle(runtime.boundsRectangle, getNodeLocalMatrix(target), getNodeLocalBoundsRectangle(target));
  runtime.boundsUsingLocalBoundsId = runtime.localBoundsId;
  runtime.boundsUsingLocalTransformId = runtime.localTransformId;
}

function recomputeLocalBoundsRectangle<Traits extends object>(
  target: BoundsNode<Traits>,
  runtime: NodeRuntime<Traits> & HasBoundsRectangleRuntime,
): void {
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  runtime.computeLocalBoundsRectangle(runtime.localBoundsRectangle, target);
  runtime.localBoundsUsingLocalBoundsId = runtime.localBoundsId;
}

function recomputeWorldBoundsRectangle<Traits extends object>(
  target: Spatial2DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasBoundsRectangleRuntime & HasTransform2DRuntime,
) {
  if (runtime.worldBoundsRectangle === null) runtime.worldBoundsRectangle = createRectangle();
  matrixTransformRectangle(
    runtime.worldBoundsRectangle,
    getNodeWorldMatrix(target),
    getNodeLocalBoundsRectangle(target),
  );
  const children = getNodeRuntime(target).children;
  if (children !== null) {
    for (const child of children) {
      if (!child.enabled) continue;
      const childWorldBounds = getNodeWorldBoundsRectangle(child as Spatial2DNode<Traits>);
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        mergeRectangle(runtime.worldBoundsRectangle, runtime.worldBoundsRectangle, childWorldBounds);
      }
    }
  }
  runtime.worldBoundsUsingWorldTransformId = runtime.worldTransformId;
  runtime.worldBoundsUsingLocalBoundsId = runtime.localBoundsId;
}

function tryFastRecomputeWorldBoundsRectangle<Traits extends object>(
  target: Spatial2DNode<Traits>,
  runtime: HasBoundsRectangleRuntime & HasTransform2DRuntime,
): boolean {
  if (runtime.worldBoundsRectangle !== null && runtime.worldMatrix !== null) {
    const { a: _a, b: _b, c: _c, d: _d, tx: _tx, ty: _ty } = runtime.worldMatrix;
    ensureNodeWorldMatrix(target);
    const { a, b, c, d, tx, ty } = runtime.worldMatrix;
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
