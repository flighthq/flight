import { Affine2D, Affine2DPool, Rectangle, RectanglePool } from '@flighthq/math';
import type { DisplayObject, Rectangle as RectangleLike, Vector2 as Vector2Like } from '@flighthq/types';
import { BlendMode, DirtyFlags, DisplayObjectDerivedState } from '@flighthq/types';

// temp
function createRectangle() {
  return new Rectangle();
}
function createAffine2D() {
  return new Affine2D();
}

// Constructor

export function create(obj: Partial<DisplayObject> = {}): DisplayObject {
  if (obj.alpha === undefined) obj.alpha = 1;
  if (obj.blendMode === undefined) obj.blendMode = BlendMode.Normal;
  if (obj.cacheAsBitmap === undefined) obj.cacheAsBitmap = false;
  if (obj.cacheAsBitmapMatrix === undefined) obj.cacheAsBitmapMatrix = null;
  if (obj.filters === undefined) obj.filters = null;
  if (obj.mask === undefined) obj.mask = null;
  if (obj.name === undefined) obj.name = null;
  if (obj.opaqueBackground === undefined) obj.opaqueBackground = null;
  if (obj.parent === undefined) (obj as any).parent = null;
  if (obj.rotation === undefined) obj.rotation = 0;
  if (obj.scale9Grid === undefined) obj.scale9Grid = null;
  if (obj.scaleX === undefined) obj.scaleX = 1;
  if (obj.scaleY === undefined) obj.scaleY = 1;
  if (obj.scrollRect === undefined) obj.scrollRect = null;
  if (obj.shader === undefined) obj.shader = null;
  if (obj.stage === undefined) (obj as any).stage = null;
  if (obj.visible === undefined) obj.visible = true;
  if (obj.x === undefined) obj.x = 0;
  if (obj.y === undefined) obj.y = 0;
  return obj as DisplayObject;
}

// Methods

/**
 * Returns a rectangle that defines the area of the display object relative
 * to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function getBounds(
  out: RectangleLike,
  source: DisplayObject,
  targetCoordinateSpace: DisplayObject | null | undefined,
): void {
  const sourceState = getDerivedState(source);
  updateLocalBounds(source);
  if (targetCoordinateSpace && targetCoordinateSpace !== source) {
    updateWorldTransform(source);
    updateWorldTransform(targetCoordinateSpace);
    const targetState = getDerivedState(targetCoordinateSpace);
    const transform = Affine2DPool.get();
    Affine2D.inverse(transform, targetState.worldTransform!);
    Affine2D.multiply(transform, transform, sourceState.worldTransform!);
    Affine2D.transformRect(out, transform, sourceState.localBounds!);
    Affine2DPool.release(transform);
  } else {
    Rectangle.copy(out, sourceState.localBounds!);
  }
}

export function getDerivedState(source: DisplayObject): DisplayObjectDerivedState {
  if (source[DisplayObjectDerivedState.Key] === undefined) {
    source[DisplayObjectDerivedState.Key] = {
      bounds: null,
      children: null,
      dirtyFlags: DirtyFlags.None,
      localBounds: null,
      localBoundsID: 0,
      localTransform: null,
      localTransformID: 0,
      parentTransformID: 0,
      rotationAngle: 0,
      rotationCosine: 1,
      rotationSine: 0,
      worldBounds: null,
      worldTransform: null,
      worldTransformID: 0,
    };
  }
  return source[DisplayObjectDerivedState.Key];
}

/**
 * Returns a rectangle that defines the boundary of the display object, based
 * on the coordinate system defined by the `targetCoordinateSpace`
 * parameter, excluding any strokes on shapes. The values that the
 * `getRect()` method returns are the same or smaller than those
 * returned by the `getBounds()` method.
 **/
export function getRect(
  out: RectangleLike,
  source: DisplayObject,
  targetCoordinateSpace: DisplayObject | null | undefined,
): void {
  // TODO: Fill bounds only
  getBounds(out, source, targetCoordinateSpace);
}

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal(out: Vector2Like, source: DisplayObject, pos: Readonly<Vector2Like>): void {
  updateWorldTransform(source);
  Affine2D.inverseTransformPointXY(out, getDerivedState(source).worldTransform!, pos.x, pos.y);
}

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
 **/
export function hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
  if (other.parent !== null && source.parent !== null) {
    updateLocalBounds(source);
    const sourceState = getDerivedState(source);
    const sourceBounds = sourceState.localBounds!;
    const otherBounds = RectanglePool.get();
    // compare other in source's coordinate space
    getBounds(otherBounds, other, source);
    const result = Rectangle.intersects(sourceBounds, otherBounds);
    RectanglePool.release(otherBounds);
    return result;
  }
  return false;
}

const _tempPoint = { x: 0, y: 0 };

/**
  Evaluates the display object to see if it overlaps or intersects with the
  point specified by the `x` and `y` parameters in world coordinates.

  @param shapeFlag Whether to check against the actual pixels of the object
          (`true`) or the bounding box
          (`false`).
**/
export function hitTestPoint(source: DisplayObject, x: number, y: number, _shapeFlag: boolean = false): boolean {
  if (!source.visible || source.opaqueBackground === null) return false;
  updateWorldTransform(source);
  const sourceState = getDerivedState(source);
  Affine2D.inverseTransformPointXY(_tempPoint, sourceState.worldTransform!, x, y);
  updateLocalBounds(source);
  return Rectangle.contains(sourceState.localBounds!, _tempPoint.x, _tempPoint.y);
}

/**
 * Calling `invalidate()` signals that the current object has changed and
 * should be redrawn the next time it is eligible to be rendered.
 */
export function invalidate(target: DisplayObject, flags: DirtyFlags = DirtyFlags.Render): void {
  const targetState = getDerivedState(target);
  if ((targetState.dirtyFlags & flags) === flags) return;

  targetState.dirtyFlags |= flags;

  if ((flags & DirtyFlags.Transform) !== 0) {
    // If transform changed, transformed bounds must also be updated
    targetState.dirtyFlags |= DirtyFlags.TransformedBounds;
    targetState.localTransformID++;
  }

  if ((flags & DirtyFlags.Bounds) !== 0) {
    // Changing local bounds also requires transformed bounds update
    targetState.dirtyFlags |= DirtyFlags.TransformedBounds;
    targetState.localBoundsID++;
  }
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal(out: Vector2Like, source: DisplayObject, point: Readonly<Vector2Like>): void {
  updateWorldTransform(source);
  const sourceState = getDerivedState(source);
  Affine2D.transformPointXY(out, sourceState.worldTransform!, point.x, point.y);
}

export function update(target: DisplayObject): void {
  updateBounds(target);
  updateWorldBounds(target);
}

export function updateBounds(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.bounds !== null && (targetState.dirtyFlags & DirtyFlags.TransformedBounds) === 0) return;

  updateLocalBounds(target);
  updateLocalTransform(target);

  if (targetState.bounds === null) targetState.bounds = createRectangle();
  Affine2D.transformRect(targetState.bounds, targetState.localTransform!, targetState.localBounds!);

  targetState.dirtyFlags &= ~DirtyFlags.TransformedBounds;
}

export function updateLocalBounds(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.localBounds === null) targetState.localBounds = createRectangle();
}

export function updateLocalTransform(target: DisplayObject): void {
  const targetState = getDerivedState(target);
  if (targetState.localTransform !== null && (targetState.dirtyFlags & DirtyFlags.Transform) === 0) return;

  if (target.rotation !== targetState.rotationAngle) {
    // Normalize from -180 to 180
    let angle = target.rotation % 360.0;
    if (angle > 180.0) {
      angle -= 360.0;
    } else if (angle < -180.0) {
      angle += 360.0;
    }

    // Use fast cardinal values, or lookup
    const DEG_TO_RAD = Math.PI / 180;
    let sin, cos;
    if (angle === 0) {
      sin = 0;
      cos = 1;
    } else if (angle === 90) {
      sin = 1;
      cos = 0;
    } else if (angle === -90) {
      sin = -1;
      cos = 0;
    } else if (angle === 180 || angle === -180) {
      sin = 0;
      cos = -1;
    } else {
      const rad = angle * DEG_TO_RAD;
      sin = Math.sin(rad);
      cos = Math.cos(rad);
    }

    targetState.rotationAngle = angle;
    targetState.rotationSine = sin;
    targetState.rotationCosine = cos;
  }

  if (targetState.localTransform === null) targetState.localTransform = createAffine2D();
  const matrix = targetState.localTransform;
  const a = targetState.rotationCosine * target.scaleX;
  const b = targetState.rotationSine * target.scaleX;
  const c = -targetState.rotationSine * target.scaleY;
  const d = targetState.rotationCosine * target.scaleY;
  const tx = target.x;
  const ty = target.y;
  matrix.m[0] = a;
  matrix.m[1] = b;
  matrix.m[2] = tx;
  matrix.m[3] = c;
  matrix.m[4] = d;
  matrix.m[5] = ty;

  targetState.dirtyFlags &= ~DirtyFlags.Transform;
}

export function updateWorldBounds(target: DisplayObject): void {
  updateWorldTransform(target);
  updateLocalBounds(target);

  const targetState = getDerivedState(target);
  if (targetState.worldBounds === null) targetState.worldBounds = createRectangle();

  // TODO: Cache
  Affine2D.transformRect(targetState.worldBounds, targetState.worldTransform!, targetState.bounds!);
}

export function updateWorldTransform(target: DisplayObject): void {
  // Recursively allow parents to update if out-of-date
  const parent = target.parent;
  if (parent !== null) {
    updateWorldTransform(parent);
  }
  const parentState = parent !== null ? getDerivedState(parent) : null;
  const parentTransformID = parentState !== null ? parentState.worldTransformID : 0;
  // Update if local transform ID or parent world transform ID changed
  const targetState = getDerivedState(target);
  if (targetState.worldTransform === null) targetState.worldTransform = createAffine2D();

  if (
    targetState.worldTransformID !== targetState.localTransformID ||
    targetState.parentTransformID !== parentTransformID
  ) {
    // Ensure local transform is accurate
    updateLocalTransform(target);
    if (parentState !== null) {
      Affine2D.multiply(targetState.worldTransform, parentState.worldTransform!, targetState.localTransform!);
    } else {
      Affine2D.copy(targetState.worldTransform, targetState.localTransform!);
    }
    targetState.parentTransformID = parentTransformID;
    targetState.worldTransformID = targetState.localTransformID;
  }
}
