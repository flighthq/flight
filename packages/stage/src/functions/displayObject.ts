import { Affine2D, Affine2DPool, Rectangle, RectanglePool } from '@flighthq/math';
import type {
  Affine2D as Affine2DLike,
  BitmapFilter,
  DisplayObject,
  DisplayObjectContainer,
  LoaderInfo,
  Rectangle as RectangleLike,
  Shader,
  Stage,
  Transform,
  Vector2 as Vector2Like,
} from '@flighthq/types';
import { BlendMode, DirtyFlags, DisplayObjectSymbols as $ } from '@flighthq/types';

import { create as createTransform } from './transform.js';

// temp
function createRectangle() {
  return new Rectangle();
}
function createAffine2D() {
  return new Affine2D();
}

// Constructor

export function create(obj: Partial<DisplayObject> = {}): DisplayObject {
  if (obj[$.alpha] === undefined) obj[$.alpha] = 1;
  if (obj[$.blendMode] === undefined) obj[$.blendMode] = BlendMode.Normal;
  if (obj[$.bounds] === undefined) obj[$.bounds] = createRectangle();
  if (obj[$.cacheAsBitmap] === undefined) obj[$.cacheAsBitmap] = false;
  if (obj[$.cacheAsBitmapMatrix] === undefined) obj[$.cacheAsBitmapMatrix] = null;
  if (obj[$.children] === undefined) obj[$.children] = null;
  if (obj[$.dirtyFlags] === undefined) obj[$.dirtyFlags] = DirtyFlags.None;
  if (obj[$.filters] === undefined) obj[$.filters] = null;
  if (obj[$.height] === undefined) obj[$.height] = 0;
  if (obj[$.loaderInfo] === undefined) obj[$.loaderInfo] = null;
  if (obj[$.localBounds] === undefined) obj[$.localBounds] = createRectangle();
  if (obj[$.localBoundsID] === undefined) obj[$.localBoundsID] = 0;
  if (obj[$.localTransform] === undefined) obj[$.localTransform] = createAffine2D();
  if (obj[$.localTransformID] === undefined) obj[$.localTransformID] = 0;
  if (obj[$.mask] === undefined) obj[$.mask] = null;
  if (obj[$.maskedObject] === undefined) obj[$.maskedObject] = null;
  if (obj[$.name] === undefined) obj[$.name] = null;
  if (obj[$.opaqueBackground] === undefined) obj[$.opaqueBackground] = null;
  if (obj[$.parent] === undefined) obj[$.parent] = null;
  if (obj[$.parentTransformID] === undefined) obj[$.parentTransformID] = 0;
  if (obj[$.root] === undefined) obj[$.root] = null;
  if (obj[$.rotationAngle] === undefined) obj[$.rotationAngle] = 0;
  if (obj[$.rotationCosine] === undefined) obj[$.rotationCosine] = 1;
  if (obj[$.rotationSine] === undefined) obj[$.rotationSine] = 0;
  if (obj[$.scale9Grid] === undefined) obj[$.scale9Grid] = null;
  if (obj[$.scaleX] === undefined) obj[$.scaleX] = 1;
  if (obj[$.scaleY] === undefined) obj[$.scaleY] = 1;
  if (obj[$.scrollRect] === undefined) obj[$.scrollRect] = null;
  if (obj[$.shader] === undefined) obj[$.shader] = null;
  if (obj[$.stage] === undefined) obj[$.stage] = null;
  if (obj[$.transform] === undefined) obj[$.transform] = null;
  if (obj[$.width] === undefined) obj[$.width] = 0;
  if (obj[$.worldBounds] === undefined) obj[$.worldBounds] = createRectangle();
  if (obj[$.worldTransform] === undefined) obj[$.worldTransform] = createAffine2D();
  if (obj[$.worldTransformID] === undefined) obj[$.worldTransformID] = 0;
  if (obj[$.visible] === undefined) obj[$.visible] = true;
  if (obj[$.x] === undefined) obj[$.x] = 0;
  if (obj[$.y] === undefined) obj[$.y] = 0;
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
  if (source !== targetCoordinateSpace) updateWorldTransform(source);
  if (targetCoordinateSpace && targetCoordinateSpace !== source) {
    updateWorldTransform(targetCoordinateSpace);
    updateLocalBounds(source);
    const transform = Affine2DPool.get();
    Affine2D.inverse(transform, targetCoordinateSpace[$.worldTransform]);
    Affine2D.multiply(transform, transform, source[$.worldTransform]);
    Affine2D.transformRect(out, transform, source[$.localBounds]);
    Affine2DPool.release(transform);
  } else {
    Rectangle.copy(out, source[$.localBounds]);
  }
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
  Affine2D.inverseTransformPointXY(out, source[$.worldTransform], pos.x, pos.y);
}

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
 **/
export function hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
  if (other[$.parent] !== null && source[$.parent] !== null) {
    updateLocalBounds(source);
    const sourceBounds = source[$.localBounds];
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
  if (!source[$.visible] || source[$.opaqueBackground] === null) return false;
  updateWorldTransform(source);
  Affine2D.inverseTransformPointXY(_tempPoint, source[$.worldTransform], x, y);
  updateLocalBounds(source);
  return Rectangle.contains(source[$.localBounds], _tempPoint.x, _tempPoint.y);
}

/**
 * Calling `invalidate()` signals that the current object has changed and
 * should be redrawn the next time it is eligible to be rendered.
 */
export function invalidate(target: DisplayObject, flags: DirtyFlags = DirtyFlags.Render): void {
  if ((target[$.dirtyFlags] & flags) === flags) return;

  target[$.dirtyFlags] |= flags;

  if ((flags & DirtyFlags.Transform) !== 0) {
    // If transform changed, transformed bounds must also be updated
    target[$.dirtyFlags] |= DirtyFlags.TransformedBounds;
    target[$.localTransformID]++;
  }

  if ((flags & DirtyFlags.Bounds) !== 0) {
    // Changing local bounds also requires transformed bounds update
    target[$.dirtyFlags] |= DirtyFlags.TransformedBounds;
    target[$.localBoundsID]++;
  }
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal(out: Vector2Like, source: DisplayObject, point: Readonly<Vector2Like>): void {
  updateWorldTransform(source);
  Affine2D.transformPointXY(out, source[$.worldTransform], point.x, point.y);
}

export function update(target: DisplayObject): void {
  updateBounds(target);
  updateWorldBounds(target);
}

export function updateLocalBounds(target: DisplayObject): void {
  if ((target[$.dirtyFlags] & DirtyFlags.Bounds) === 0) return;

  // TODO, update __localBounds

  target[$.dirtyFlags] &= ~DirtyFlags.Bounds;
}

export function updateLocalTransform(target: DisplayObject): void {
  if ((target[$.dirtyFlags] & DirtyFlags.Transform) === 0) return;

  const matrix = target[$.localTransform];
  const a = target[$.rotationCosine] * target[$.scaleX];
  const b = target[$.rotationSine] * target[$.scaleX];
  const c = -target[$.rotationSine] * target[$.scaleY];
  const d = target[$.rotationCosine] * target[$.scaleY];
  const tx = target[$.x];
  const ty = target[$.y];
  matrix.m[0] = a;
  matrix.m[1] = b;
  matrix.m[2] = tx;
  matrix.m[3] = c;
  matrix.m[4] = d;
  matrix.m[5] = ty;

  target[$.dirtyFlags] &= ~DirtyFlags.Transform;
}

export function updateBounds(target: DisplayObject): void {
  if ((target[$.dirtyFlags] & DirtyFlags.TransformedBounds) === 0) return;

  updateLocalBounds(target);
  updateLocalTransform(target);

  Affine2D.transformRect(target[$.bounds], target[$.localTransform], target[$.localBounds]);

  target[$.dirtyFlags] &= ~DirtyFlags.TransformedBounds;
}

export function updateWorldBounds(target: DisplayObject): void {
  updateWorldTransform(target);

  // TODO: Cache
  Affine2D.transformRect(target[$.worldBounds], target[$.worldTransform], target[$.bounds]);
}

export function updateWorldTransform(target: DisplayObject): void {
  // Recursively allow parents to update if out-of-date
  const parent = target[$.parent];
  if (parent !== null) {
    updateWorldTransform(parent);
  }
  const parentTransformID = parent !== null ? parent[$.worldTransformID] : 0;
  // Update if local transform ID or parent world transform ID changed
  if (target[$.worldTransformID] !== target[$.localTransformID] || target[$.parentTransformID] !== parentTransformID) {
    // Ensure local transform is accurate
    updateLocalTransform(target);
    if (parent !== null) {
      Affine2D.multiply(target[$.worldTransform], parent[$.worldTransform], target[$.localTransform]);
    } else {
      Affine2D.copy(target[$.worldTransform], target[$.localTransform]);
    }
    target[$.parentTransformID] = parentTransformID;
    target[$.worldTransformID] = target[$.localTransformID];
  }
}

// Get & Set Methods

export function getAlpha(source: Readonly<DisplayObject>): number {
  return source[$.alpha];
}

export function setAlpha(target: DisplayObject, value: number) {
  if (value > 1.0) value = 1.0;
  if (value < 0.0) value = 0.0;
  if (value === target[$.alpha]) return;
  target[$.alpha] = value;
  invalidate(target, DirtyFlags.Appearance);
}

export function getBlendMode(source: Readonly<DisplayObject>): BlendMode {
  return source[$.blendMode];
}

export function setBlendMode(target: DisplayObject, value: BlendMode) {
  if (value === target[$.blendMode]) return;
  target[$.blendMode] = value;
  invalidate(target, DirtyFlags.Appearance);
}

export function getCacheAsBitmap(source: Readonly<DisplayObject>): boolean {
  return source[$.filters] === null ? source[$.cacheAsBitmap] : true;
}

export function setCacheAsBitmap(target: DisplayObject, value: boolean) {
  if (value === target[$.cacheAsBitmap]) return;
  target[$.cacheAsBitmap] = value;
  invalidate(target, DirtyFlags.CacheAsBitmap);
}

export function getCacheAsBitmapMatrix(source: Readonly<DisplayObject>): Affine2DLike | null {
  return source[$.cacheAsBitmapMatrix];
}

export function setCacheAsBitmapMatrix(target: DisplayObject, value: Affine2DLike | null) {
  if (Affine2D.equals(target[$.cacheAsBitmapMatrix], value)) return;

  if (value !== null) {
    if (target[$.cacheAsBitmapMatrix] === null) {
      target[$.cacheAsBitmapMatrix] = Affine2D.clone(value);
    } else {
      Affine2D.copy(target[$.cacheAsBitmapMatrix] as Affine2D, value);
    }
  } else {
    target[$.cacheAsBitmapMatrix] = null;
  }

  if (target[$.cacheAsBitmap]) {
    invalidate(target, DirtyFlags.Transform);
  }
}

export function getFilters(source: Readonly<DisplayObject>): BitmapFilter[] {
  const filters = source[$.filters];
  if (filters === null) {
    return [];
  } else {
    return filters.slice();
  }
}

export function setFilters(target: DisplayObject, value: BitmapFilter[] | null) {
  if ((value === null || value.length == 0) && target[$.filters] === null) return;

  // if (value !== null) {
  //   target[$.filters] = value.map((filter) => {
  //     return filter.clone();
  //   });
  // } else {
  target[$.filters] = null;
  // }

  invalidate(target, DirtyFlags.CacheAsBitmap);
}

export function getHeight(source: Readonly<DisplayObject>): number {
  updateBounds(source);
  return source[$.bounds].height;
}

export function setHeight(target: DisplayObject, value: number) {
  updateLocalBounds(target);
  if (target[$.localBounds].height === 0) return;
  // Invalidation (if necessary) occurs in scaleY setter
  setScaleY(target, value / target[$.localBounds].height);
}

export function getLoaderInfo(source: Readonly<DisplayObject>): LoaderInfo | null {
  // If loaderInfo was set by a Loader, return
  if (source[$.loaderInfo] !== null) return source[$.loaderInfo];
  // Otherwise return info of root
  return source[$.root] ? source[$.root]![$.loaderInfo] : null;
}

export function getMask(source: Readonly<DisplayObject>): DisplayObject | null {
  return source[$.mask];
}

export function setMask(target: DisplayObject, value: DisplayObject | null) {
  if (value === target[$.mask]) return;

  if (target[$.mask] !== null) {
    (target[$.mask] as DisplayObject)[$.maskedObject] = null;
  }
  if (value !== null) {
    value[$.maskedObject] = target;
  }

  target[$.mask] = value;
  invalidate(target, DirtyFlags.Clip);
}

export function getName(source: Readonly<DisplayObject>): string | null {
  return source[$.name];
}

export function setName(target: DisplayObject, value: string | null) {
  target[$.name] = value;
}

export function getOpaqueBackground(source: Readonly<DisplayObject>): number | null {
  return source[$.opaqueBackground];
}

export function setOpaqueBackground(target: DisplayObject, value: number | null) {
  if (value === target[$.opaqueBackground]) return;
  target[$.opaqueBackground] = value;
  invalidate(target, DirtyFlags.Appearance);
}

export function getParent(source: Readonly<DisplayObject>): DisplayObjectContainer | null {
  return source[$.parent];
}

export function getRoot(source: Readonly<DisplayObject>): DisplayObjectContainer | null {
  return source[$.root];
}

export function getRotation(source: Readonly<DisplayObject>): number {
  return source[$.rotationAngle];
}

export function setRotation(target: DisplayObject, value: number) {
  if (value === target[$.rotationAngle]) return;

  // Normalize from -180 to 180
  value = value % 360.0;
  if (value > 180.0) {
    value -= 360.0;
  } else if (value < -180.0) {
    value += 360.0;
  }

  // Use fast cardinal values, or lookup
  const DEG_TO_RAD = Math.PI / 180;
  let sin, cos;
  if (value === 0) {
    sin = 0;
    cos = 1;
  } else if (value === 90) {
    sin = 1;
    cos = 0;
  } else if (value === -90) {
    sin = -1;
    cos = 0;
  } else if (value === 180 || value === -180) {
    sin = 0;
    cos = -1;
  } else {
    const rad = value * DEG_TO_RAD;
    sin = Math.sin(rad);
    cos = Math.cos(rad);
  }

  target[$.rotationAngle] = value;
  target[$.rotationSine] = sin;
  target[$.rotationCosine] = cos;
  invalidate(target, DirtyFlags.Transform);
}

export function getScale9Grid(source: Readonly<DisplayObject>): Rectangle | null {
  if (source[$.scale9Grid] === null) {
    return null;
  }
  return Rectangle.clone(source[$.scale9Grid] as Rectangle);
}

export function setScale9Grid(target: DisplayObject, value: Rectangle | null) {
  if (value === null && target[$.scale9Grid] === null) return;
  if (value !== null && target[$.scale9Grid] !== null && Rectangle.equals(target[$.scale9Grid] as Rectangle, value))
    return;

  if (value != null) {
    if (target[$.scale9Grid] === null) target[$.scale9Grid] = new Rectangle();
    Rectangle.copy(target[$.scale9Grid] as Rectangle, value);
  } else {
    target[$.scale9Grid] = null;
  }

  invalidate(target, DirtyFlags.Appearance | DirtyFlags.Bounds | DirtyFlags.Clip | DirtyFlags.Transform);
}

export function getScaleX(source: Readonly<DisplayObject>): number {
  return source[$.scaleX];
}

export function setScaleX(target: DisplayObject, value: number) {
  if (value === target[$.scaleX]) return;
  target[$.scaleX] = value;
  invalidate(target, DirtyFlags.Transform);
}

export function getScaleY(source: Readonly<DisplayObject>): number {
  return source[$.scaleY];
}

export function setScaleY(target: DisplayObject, value: number) {
  if (value === target[$.scaleY]) return;
  target[$.scaleY] = value;
  invalidate(target, DirtyFlags.Transform);
}

export function getScrollRect(source: Readonly<DisplayObject>): Rectangle | null {
  if (source[$.scrollRect] === null) {
    return null;
  }
  return Rectangle.clone(source[$.scrollRect] as Rectangle);
}

export function setScrollRect(target: DisplayObject, value: Rectangle | null) {
  if (value === null && target[$.scrollRect] === null) return;
  if (value !== null && target[$.scrollRect] !== null && Rectangle.equals(target[$.scrollRect] as Rectangle, value))
    return;

  if (value !== null) {
    if (target[$.scrollRect] === null) target[$.scrollRect] = new Rectangle();
    Rectangle.copy(target[$.scrollRect] as Rectangle, value);
  } else {
    target[$.scrollRect] = null;
  }

  target[$.scrollRect] = value;
  invalidate(target, DirtyFlags.Clip);
}

export function getShader(source: Readonly<DisplayObject>): Shader | null {
  return source[$.shader];
}

export function setShader(target: DisplayObject, value: Shader | null) {
  if (value === target[$.shader]) return;
  target[$.shader] = value;
  invalidate(target, DirtyFlags.Appearance);
}

export function getStage(source: Readonly<DisplayObject>): Stage | null {
  return source[$.stage];
}

export function getTransform(source: DisplayObject): Transform {
  if (source[$.transform] === null) {
    source[$.transform] = createTransform({}, source);
  }
  return source[$.transform] as Transform;
}

export function setTransform(target: DisplayObject, value: Transform) {
  if (value === null) {
    throw new TypeError('Parameter transform must be non-null.');
  }

  if (target[$.transform] === null) {
    target[$.transform] = createTransform({}, target);
  }

  // if (value.__hasAffine2D)
  // {
  //     var other = value.__displayObject.__transform;
  //     __objectTransform.__setTransform(other.a, other.b, other.c, other.d, other.tx, other.ty);
  // }
  // else
  // {
  //     __objectTransform.__hasAffine2D = false;
  // }

  // if (!__objectTransform.__colorTransform.__equals(value.__colorTransform, true)
  //     || (!cacheAsBitmap && __objectTransform.__colorTransform.alphaMultiplier != value.__colorTransform.alphaMultiplier))
  // {
  //     __objectTransform.__colorTransform.__copyFrom(value.colorTransform);
  //     __setRenderDirty();
  // }
}

export function getVisible(source: Readonly<DisplayObject>): boolean {
  return source[$.visible];
}

export function setVisible(target: DisplayObject, value: boolean) {
  if (value === target[$.visible]) return;
  target[$.visible] = value;
  invalidate(target, DirtyFlags.Appearance);
}

export function getWidth(source: Readonly<DisplayObject>): number {
  updateBounds(source);
  return source[$.bounds].width;
}

export function setWidth(target: DisplayObject, value: number) {
  updateLocalBounds(target);
  if (target[$.localBounds].width === 0) return;
  // Invalidation (if necessary) occurs in scaleX setter
  setScaleX(target, value / target[$.localBounds].width);
}

export function getX(source: Readonly<DisplayObject>): number {
  return source[$.x];
}

export function setX(target: DisplayObject, value: number) {
  if (value !== value) value = 0; // Flash converts NaN to 0
  if (value === target[$.x]) return;
  target[$.x] = value;
  invalidate(target, DirtyFlags.Transform);
}

export function getY(source: Readonly<DisplayObject>): number {
  return source[$.y];
}

export function setY(target: DisplayObject, value: number) {
  if (value !== value) value = 0; // Flash converts NaN to 0
  if (value === target[$.y]) return;
  target[$.y] = value;
  invalidate(target, DirtyFlags.Transform);
}
