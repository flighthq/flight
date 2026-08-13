import { getEntityRuntime } from '@flighthq/entity/contract';
import {
  acquireMatrix,
  copyMatrix,
  copyRectangle,
  createRectangle,
  inverseMatrix,
  matrixTransformRectangle,
  mergeRectangle,
  multiplyMatrix,
  releaseMatrix,
  setEmptyRectangle,
} from '@flighthq/geometry/contract';
import type {
  BoundsNode,
  HasBoundsRectangleRuntime,
  HasTransform2DRuntime,
  Matrix,
  NodeRuntime,
  Rectangle,
  RectangleLike,
  Spatial2DNode,
} from '@flighthq/types/contract';

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
  if (getNodeChildCount(source) === 0) {
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

/**
 * Writes the tight bounds of `root` and its enabled descendants in a coordinate system where the
 * root's own local transform is identity. A child's transform is still relative to the root and
 * nested transforms compose normally.
 *
 * This differs intentionally from computeNodeBoundsRectangle(out, root, root): that helper transforms
 * an axis-aligned world box back into root space, which cannot recover tight bounds after a root
 * rotation. Offscreen subtree capture uses this contract together with
 * computeScene2DRenderTargetTransform so the root transform cancels exactly.
 */
export function computeNodeRootLocalBoundsRectangle<Traits extends object>(
  out: RectangleLike,
  root: Spatial2DNode<Traits>,
): void {
  setEmptyRectangle(out);
  mergeRootLocalBounds(out, root, null);
}

export function ensureNodeLocalBoundsRectangle<Traits extends object>(target: BoundsNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasBoundsRectangleRuntime;
  if (!isNodeLocalBoundsRectangleValid(target, runtime)) {
    recomputeLocalBoundsRectangle(target, runtime);
  }
}

export function ensureNodeParentBoundsRectangle<Traits extends object>(target: Spatial2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasBoundsRectangleRuntime;
  if (
    !isNodeLocalBoundsRectangleValid(target, runtime) ||
    runtime.boundsUsingLocalBoundsId !== runtime.localBoundsId ||
    runtime.boundsUsingLocalTransformId !== runtime.localTransformId
  ) {
    recomputeNodeBoundsRectangle(target, runtime);
  }
}

export function ensureNodeWorldBoundsRectangle<Traits extends object>(target: Spatial2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasBoundsRectangleRuntime & HasTransform2DRuntime;
  const localBoundsInvalid =
    !isNodeLocalBoundsRectangleValid(target, runtime) ||
    runtime.worldBoundsUsingLocalBoundsId !== runtime.localBoundsId;
  const hasChildren = getNodeChildCount(target) !== 0;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRectangle(target, runtime)) return;
    forceRecompute = true;
  }
  ensureNodeWorldMatrix(target);
  const childBoundsChanged = hasChildren && ensureNodeChildWorldBoundsRectangles(target);
  if (
    forceRecompute ||
    localBoundsInvalid ||
    childBoundsChanged ||
    runtime.worldBoundsUsingWorldTransformId !== runtime.worldTransformId
  ) {
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
  const bounds = getNodeLocalBoundsRectangle(target);
  const matrix = getNodeLocalMatrix(target);
  const scaleYFactor = Math.abs(matrix.d / target.scaleY);
  const localHeight = Math.abs(bounds.height);
  // This setter is the inverse of getNodeHeight's parent-space AABB measurement. The perpendicular
  // scale contributes a fixed term, so width/height setters intentionally do not commute.
  if (scaleYFactor <= SINGULAR_AXIS_EPSILON || localHeight === 0) return;
  const fixedXTerm = Math.abs(matrix.b) * Math.abs(bounds.width);
  const adjustableHeight = value - fixedXTerm;
  if (adjustableHeight < 0) return;
  target.scaleY = Math.sign(target.scaleY) * (adjustableHeight / (scaleYFactor * localHeight));
  invalidateNodeLocalTransform(target);
}

export function setNodeWidth<Traits extends object>(target: Spatial2DNode<Traits>, value: number): void {
  if (target.scaleX === 0) return;
  const bounds = getNodeLocalBoundsRectangle(target);
  const matrix = getNodeLocalMatrix(target);
  const scaleXFactor = Math.abs(matrix.a / target.scaleX);
  const localWidth = Math.abs(bounds.width);
  // This setter is the inverse of getNodeWidth's parent-space AABB measurement. The perpendicular
  // scale contributes a fixed term, so width/height setters intentionally do not commute.
  if (scaleXFactor <= SINGULAR_AXIS_EPSILON || localWidth === 0) return;
  const fixedYTerm = Math.abs(matrix.c) * Math.abs(bounds.height);
  const adjustableWidth = value - fixedYTerm;
  if (adjustableWidth < 0) return;
  target.scaleX = Math.sign(target.scaleX) * (adjustableWidth / (scaleXFactor * localWidth));
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

function isNodeLocalBoundsRectangleValid<Traits extends object>(
  target: BoundsNode<Traits>,
  runtime: NodeRuntime<Traits> & HasBoundsRectangleRuntime,
): boolean {
  return (
    runtime.localBoundsUsingLocalBoundsId === runtime.localBoundsId &&
    (runtime.isLocalBoundsRectangleValid?.(target) ?? true)
  );
}

function ensureNodeChildWorldBoundsRectangles<Traits extends object>(target: Spatial2DNode<Traits>): boolean {
  const children = getNodeRuntime(target).children;
  if (children === null) return false;
  let changed = false;
  for (const child of children) {
    if (!child.enabled) continue;
    const childNode = child as Spatial2DNode<Traits>;
    const runtime = getNodeRuntime(childNode) as NodeRuntime<Traits> & HasBoundsRectangleRuntime;
    const previous = runtime.worldBoundsRectangle;
    const previousX = previous?.x;
    const previousY = previous?.y;
    const previousWidth = previous?.width;
    const previousHeight = previous?.height;
    ensureNodeWorldBoundsRectangle(childNode);
    const current = runtime.worldBoundsRectangle!;
    if (
      previous === null ||
      current.x !== previousX ||
      current.y !== previousY ||
      current.width !== previousWidth ||
      current.height !== previousHeight
    ) {
      changed = true;
    }
  }
  return changed;
}

function mergeRootLocalBounds<Traits extends object>(
  out: RectangleLike,
  node: Spatial2DNode<Traits>,
  transform: Readonly<Matrix> | null,
): void {
  const localBounds = getNodeLocalBoundsRectangle(node);
  if (transform === null) {
    copyRectangle(_rootLocalNodeBounds, localBounds);
  } else {
    matrixTransformRectangle(_rootLocalNodeBounds, transform, localBounds);
  }
  mergeRectangle(out, out, _rootLocalNodeBounds);

  const children = getNodeRuntime(node).children;
  if (children === null) return;
  for (const child of children) {
    if (!child.enabled) continue;
    const childTransform = acquireMatrix();
    const childLocal = getNodeLocalMatrix(child as Spatial2DNode<Traits>);
    if (transform === null) copyMatrix(childTransform, childLocal);
    else multiplyMatrix(childTransform, transform, childLocal);
    mergeRootLocalBounds(out, child as Spatial2DNode<Traits>, childTransform);
    releaseMatrix(childTransform);
  }
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
const _rootLocalNodeBounds = createRectangle();
const SINGULAR_AXIS_EPSILON = 1e-12;
