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
  HasBoundsRectangleRuntime,
  HasTransform2DRuntime,
  Rectangle,
  RectangleLike,
  SceneBoundsNode,
  SceneNodeRuntime,
  SceneSpatial2DNode,
} from '@flighthq/types';

import { getSceneNumChildren, getSceneParent } from './hierarchy';
import { invalidateLocalTransform } from './revision';
import { getSceneNodeRuntime } from './sceneNode';
import { ensureWorldTransformMatrix, getLocalTransformMatrix, getWorldTransformMatrix } from './transform2d';

/**
 * Writes a rectangle which defines the area of the scene node
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function computeBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  out: RectangleLike,
  source: SceneSpatial2DNode<SceneKind, Traits>,
  targetCoordinateSpace: SceneSpatial2DNode<SceneKind, Traits> | null | undefined,
): void {
  if (!targetCoordinateSpace) targetCoordinateSpace = source;
  let bounds;
  if (getSceneParent(targetCoordinateSpace) === null) {
    // if target has no parent, use world bounds
    bounds = getWorldBoundsRectangle(source);
  } else if (getSceneNumChildren(source) === 0) {
    // only world bounds considers children
    if (targetCoordinateSpace === source) {
      // fast path, return local bounds for self
      bounds = getLocalBoundsRectangle(source);
    } else if (targetCoordinateSpace === (getSceneParent(source) as SceneSpatial2DNode<SceneKind, Traits> | null)) {
      // fast path, return bounds for parent
      bounds = getParentBoundsRectangle(source);
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

export function ensureLocalBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneBoundsNode<SceneKind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> & HasBoundsRectangleRuntime;
  if (runtime.localBoundsUsingLocalBoundsID !== runtime.localBoundsID) {
    recomputeLocalBoundsRectangle(target, runtime);
  }
}

export function ensureParentBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> & HasBoundsRectangleRuntime;
  if (
    runtime.boundsUsingLocalBoundsID !== runtime.localBoundsID ||
    runtime.boundsUsingLocalTransformID !== runtime.localTransformID
  ) {
    recomputeBoundsRectangle(target, runtime);
  }
}

export function ensureWorldBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> &
    HasBoundsRectangleRuntime &
    HasTransform2DRuntime;
  const localBoundsInvalid = runtime.worldBoundsUsingLocalBoundsID !== runtime.localBoundsID;
  const hasChildren = getSceneNumChildren(target) !== 0;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRectangle(target, runtime)) return;
    forceRecompute = true;
  }
  ensureWorldTransformMatrix(target);
  if (forceRecompute || localBoundsInvalid || runtime.worldBoundsUsingWorldTransformID !== runtime.worldTransformID) {
    recomputeWorldBoundsRectangle(target, runtime);
  }
}

/**
 * Object's own bounds (not including children)
 */
export function getLocalBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneBoundsNode<SceneKind, Traits>,
): Readonly<Rectangle> {
  ensureLocalBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).localBoundsRectangle!;
}

/**
 * localBoundsRectangle * localTransform
 */
export function getParentBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
): Readonly<Rectangle> {
  ensureParentBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).boundsRectangle!;
}

export function getScaledBoundsHeight<SceneKind extends symbol, Traits extends object>(
  source: SceneSpatial2DNode<SceneKind, Traits>,
): number {
  computeBoundsRectangle(
    _tempBoundsRectangle,
    source,
    getSceneParent(source) as unknown as SceneSpatial2DNode<SceneKind, Traits> | null,
  );
  return _tempBoundsRectangle.height;
}

export function getScaledBoundsWidth<SceneKind extends symbol, Traits extends object>(
  source: SceneSpatial2DNode<SceneKind, Traits>,
): number {
  computeBoundsRectangle(
    _tempBoundsRectangle,
    source,
    getSceneParent(source) as unknown as SceneSpatial2DNode<SceneKind, Traits> | null,
  );
  return _tempBoundsRectangle.width;
}

/**
 * Object's bounds in world space (including children)
 */
export function getWorldBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
): Readonly<Rectangle> {
  ensureWorldBoundsRectangle(target);
  return (getEntityRuntime(target) as HasBoundsRectangleRuntime).worldBoundsRectangle!;
}

export function setScaledBoundsHeight<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
  value: number,
): void {
  if (target.scaleY === 0) return;
  target.scaleY = (value * target.scaleY) / getScaledBoundsHeight(target);
  invalidateLocalTransform(target);
}

export function setScaledBoundsWidth<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
  value: number,
): void {
  if (target.scaleX === 0) return;
  target.scaleX = (value * target.scaleX) / getScaledBoundsWidth(target);
  invalidateLocalTransform(target);
}

function recomputeBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
  runtime: SceneNodeRuntime<SceneKind, Traits> & HasBoundsRectangleRuntime,
): void {
  if (runtime.boundsRectangle === null) runtime.boundsRectangle = createRectangle();
  matrixTransformRectangle(runtime.boundsRectangle, getLocalTransformMatrix(target), getLocalBoundsRectangle(target));
  runtime.boundsUsingLocalBoundsID = runtime.localBoundsID;
  runtime.boundsUsingLocalTransformID = runtime.localTransformID;
}

function recomputeLocalBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneBoundsNode<SceneKind, Traits>,
  runtime: SceneNodeRuntime<SceneKind, Traits> & HasBoundsRectangleRuntime,
): void {
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  runtime.computeLocalBoundsRectangle(runtime.localBoundsRectangle, target);
  runtime.localBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function recomputeWorldBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
  runtime: SceneNodeRuntime<SceneKind, Traits> & HasBoundsRectangleRuntime & HasTransform2DRuntime,
) {
  if (runtime.worldBoundsRectangle === null) runtime.worldBoundsRectangle = createRectangle();
  matrixTransformRectangle(
    runtime.worldBoundsRectangle,
    getWorldTransformMatrix(target),
    getLocalBoundsRectangle(target),
  );
  const children = getSceneNodeRuntime(target).children;
  if (children !== null) {
    for (const child of children) {
      if (!child.enabled) continue;
      const childWorldBounds = getWorldBoundsRectangle(child as SceneSpatial2DNode<SceneKind, Traits>);
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        unionRectangle(runtime.worldBoundsRectangle, runtime.worldBoundsRectangle, childWorldBounds);
      }
    }
  }
  runtime.worldBoundsUsingWorldTransformID = runtime.worldTransformID;
  runtime.worldBoundsUsingLocalBoundsID = runtime.localBoundsID;
}

function tryFastRecomputeWorldBoundsRectangle<SceneKind extends symbol, Traits extends object>(
  target: SceneSpatial2DNode<SceneKind, Traits>,
  runtime: HasBoundsRectangleRuntime & HasTransform2DRuntime,
): boolean {
  if (runtime.worldBoundsRectangle !== null && runtime.worldTransform2D !== null) {
    const { a: _a, b: _b, c: _c, d: _d, tx: _tx, ty: _ty } = runtime.worldTransform2D;
    ensureWorldTransformMatrix(target);
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
