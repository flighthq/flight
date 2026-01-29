import { Matrix2D, Matrix2DPool, Point, Rectangle, RectanglePool } from '@flighthq/math';

import type { BitmapDrawable } from './BitmapDrawable.js';
import { BlendMode } from './BlendMode.js';
import { DirtyFlags } from './DirtyFlags.js';
import type DisplayObjectContainer from './DisplayObjectContainer.js';
import BitmapFilter from './filters/BitmapFilter.js';
import { internal } from './internal/DisplayObject.js';
import type LoaderInfo from './LoaderInfo.js';
import type Shader from './Shader.js';
import type Stage from './Stage.js';
import Transform from './Transform.js';

export default class DisplayObject implements BitmapDrawable {
  private static __tempPoint: Point = new Point();

  [internal._alpha]: number = 1;
  [internal._blendMode]: BlendMode = BlendMode.Normal;
  [internal._cacheAsBitmap]: boolean = false;
  [internal._cacheAsBitmapMatrix]: Matrix2D | null = null;
  [internal._dirtyFlags]: DirtyFlags = DirtyFlags.None;
  [internal._filters]: BitmapFilter[] | null = null;
  [internal._height]: number = 0;
  [internal._localBounds]: Rectangle = new Rectangle();
  [internal._localBoundsID]: number = 0;
  [internal._localTransform]: Matrix2D = new Matrix2D();
  [internal._localTransformID]: number = 0;
  [internal._loaderInfo]: LoaderInfo | null = null;
  [internal._mask]: DisplayObject | null = null;
  [internal._maskedObject]: DisplayObject | null = null;
  [internal._name]: string | null = null;
  [internal._opaqueBackground]: number | null = null;
  [internal._parent]: DisplayObjectContainer | null = null;
  [internal._parentTransformID]: number = 0;
  [internal._root]: DisplayObjectContainer | null = null;
  [internal._rotationAngle]: number = 0;
  [internal._rotationCosine]: number = 1;
  [internal._rotationSine]: number = 0;
  [internal._scale9Grid]: Rectangle | null = null;
  [internal._scaleX]: number = 1;
  [internal._scaleY]: number = 1;
  [internal._scrollRect]: Rectangle | null = null;
  [internal._shader]: Shader | null = null;
  [internal._stage]: Stage | null = null;
  [internal._transform]: Transform | null = null;
  [internal._transformedBounds]: Rectangle = new Rectangle();
  [internal._width]: number = 0;
  [internal._worldTransform]: Matrix2D = new Matrix2D();
  [internal._worldTransformID]: number = 0;
  [internal._visible]: boolean = true;
  [internal._x]: number = 0;
  [internal._y]: number = 0;

  constructor() {}

  /**
   * Returns a rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object.
   *
   * Returns a new Rectangle().
   * @see getBoundsTo
   **/
  static getBounds(source: DisplayObject, targetCoordinateSpace: DisplayObject | null): Rectangle {
    const out = new Rectangle();
    this.getBoundsTo(out, source, targetCoordinateSpace);
    return out;
  }

  /**
   * Writes the rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object to out.
   **/
  static getBoundsTo(out: Rectangle, source: DisplayObject, targetCoordinateSpace: DisplayObject | null): void {
    if (source !== targetCoordinateSpace) this.__updateWorldTransform(source);
    if (targetCoordinateSpace !== null && targetCoordinateSpace !== source) {
      this.__updateWorldTransform(targetCoordinateSpace);
      this.__updateLocalBounds(source);
      const transform = Matrix2DPool.get();
      Matrix2D.inverse(transform, targetCoordinateSpace[internal._worldTransform]);
      Matrix2D.multiply(transform, transform, source[internal._worldTransform]);
      Matrix2D.transformRectTo(out, transform, source[internal._localBounds]);
      Matrix2DPool.release(transform);
    } else {
      Rectangle.copyFrom(out, source[internal._localBounds]);
    }
  }

  /**
   * Returns a rectangle that defines the boundary of the display object, based
   * on the coordinate system defined by the `targetCoordinateSpace`
   * parameter, excluding any strokes on shapes. The values that the
   * `getRect()` method returns are the same or smaller than those
   * returned by the `getBounds()` method.
   *
   * Returns a new Rectangle().
   * @see getRectTo
   **/
  static getRect(source: DisplayObject, targetCoordinateSpace: DisplayObject | null): Rectangle {
    const out = new Rectangle();
    this.getRectTo(out, source, targetCoordinateSpace);
    return out;
  }

  /**
   * Returns a rectangle that defines the boundary of the display object, based
   * on the coordinate system defined by the `targetCoordinateSpace`
   * parameter, excluding any strokes on shapes. The values that the
   * `getRect()` method returns are the same or smaller than those
   * returned by the `getBounds()` method.
   **/
  static getRectTo(out: Rectangle, source: DisplayObject, targetCoordinateSpace: DisplayObject | null): void {
    // TODO: Fill bounds only
    this.getBoundsTo(out, source, targetCoordinateSpace);
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   *
   * Returns a new Point()
   * @see globalToLocalTo
   **/
  static globalToLocal(source: DisplayObject, pos: Point): Point {
    const out = new Point();
    this.globalToLocalTo(out, source, pos);
    return out;
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   **/
  static globalToLocalTo(out: Point, source: DisplayObject, pos: Point): void {
    this.__updateWorldTransform(source);
    Matrix2D.inverseTransformXY(out, source[internal._worldTransform], pos.x, pos.y);
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  static hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
    if (other[internal._parent] !== null && source[internal._parent] !== null) {
      this.__updateLocalBounds(source);
      const sourceBounds = source[internal._localBounds];
      const otherBounds = RectanglePool.get();
      // compare other in source's coordinate space
      this.getBoundsTo(otherBounds, other, source);
      const result = Rectangle.intersects(sourceBounds, otherBounds);
      RectanglePool.release(otherBounds);
      return result;
    }
    return false;
  }

  /**
		Evaluates the display object to see if it overlaps or intersects with the
		point specified by the `x` and `y` parameters in world coordinates.

    @param shapeFlag Whether to check against the actual pixels of the object
						(`true`) or the bounding box
						(`false`).
	**/
  static hitTestPoint(source: DisplayObject, x: number, y: number, _shapeFlag: boolean = false): boolean {
    if (!source[internal._visible] || source[internal._opaqueBackground] === null) return false;
    this.__updateWorldTransform(source);
    Matrix2D.inverseTransformXY(this.__tempPoint, source[internal._worldTransform], x, y);
    this.__updateLocalBounds(source);
    return Rectangle.contains(source[internal._localBounds], this.__tempPoint.x, this.__tempPoint.y);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  static invalidate(target: DisplayObject, flags: DirtyFlags = DirtyFlags.Render): void {
    if ((target[internal._dirtyFlags] & flags) === flags) return;

    target[internal._dirtyFlags] |= flags;

    if ((flags & DirtyFlags.Transform) !== 0) {
      // If transform changed, transformed bounds must also be updated
      target[internal._dirtyFlags] |= DirtyFlags.TransformedBounds;
      target[internal._localTransformID]++;
    }

    if ((flags & DirtyFlags.Bounds) !== 0) {
      // Changing local bounds also requires transformed bounds update
      target[internal._dirtyFlags] |= DirtyFlags.TransformedBounds;
      target[internal._localBoundsID]++;
    }
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   *
   * Returns a new Point()
   * @see localToGlobalTo
   **/
  static localToGlobal(source: DisplayObject, point: Point): Point {
    const out = new Point();
    this.localToGlobalTo(out, source, point);
    return out;
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   **/
  static localToGlobalTo(out: Point, source: DisplayObject, point: Point): void {
    this.__updateWorldTransform(source);
    Matrix2D.transformXY(out, source[internal._worldTransform], point.x, point.y);
  }

  protected static __updateLocalBounds(target: DisplayObject): void {
    if ((target[internal._dirtyFlags] & DirtyFlags.Bounds) === 0) return;

    // TODO, update __localBounds

    target[internal._dirtyFlags] &= ~DirtyFlags.Bounds;
  }

  protected static __updateLocalTransform(target: DisplayObject): void {
    if ((target[internal._dirtyFlags] & DirtyFlags.Transform) === 0) return;

    const matrix = target[internal._localTransform];
    matrix.a = target[internal._rotationCosine] * target[internal._scaleX];
    matrix.b = target[internal._rotationSine] * target[internal._scaleX];
    matrix.c = -target[internal._rotationSine] * target[internal._scaleY];
    matrix.d = target[internal._rotationCosine] * target[internal._scaleY];
    matrix.tx = target[internal._x];
    matrix.ty = target[internal._y];

    target[internal._dirtyFlags] &= ~DirtyFlags.Transform;
  }

  protected static __updateTransformedBounds(target: DisplayObject): void {
    if ((target[internal._dirtyFlags] & DirtyFlags.TransformedBounds) === 0) return;

    this.__updateLocalBounds(target);
    this.__updateLocalTransform(target);

    Matrix2D.transformRectTo(
      target[internal._transformedBounds],
      target[internal._localTransform],
      target[internal._localBounds],
    );

    target[internal._dirtyFlags] &= ~DirtyFlags.TransformedBounds;
  }

  protected static __updateWorldTransform(target: DisplayObject): void {
    // Recursively allow parents to update if out-of-date
    const parent = target[internal._parent];
    if (parent !== null) {
      this.__updateWorldTransform(parent);
    }
    const parentTransformID = parent !== null ? parent[internal._worldTransformID] : 0;
    // Update if local transform ID or parent world transform ID changed
    if (
      target[internal._worldTransformID] !== target[internal._localTransformID] ||
      target[internal._parentTransformID] !== parentTransformID
    ) {
      // Ensure local transform is accurate
      this.__updateLocalTransform(target);
      if (parent !== null) {
        Matrix2D.multiply(
          target[internal._worldTransform],
          parent[internal._worldTransform],
          target[internal._localTransform],
        );
      } else {
        Matrix2D.copyFrom(target[internal._worldTransform], target[internal._localTransform]);
      }
      target[internal._parentTransformID] = parentTransformID;
      target[internal._worldTransformID] = target[internal._localTransformID];
    }
  }

  // Get & Set Methods

  get alpha(): number {
    return this[internal._alpha];
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this[internal._alpha]) return;
    this[internal._alpha] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get blendMode(): BlendMode {
    return this[internal._blendMode];
  }

  set blendMode(value: BlendMode) {
    if (value === this[internal._blendMode]) return;
    this[internal._blendMode] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get cacheAsBitmap(): boolean {
    return this[internal._filters] === null ? this[internal._cacheAsBitmap] : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this[internal._cacheAsBitmap]) return;
    this[internal._cacheAsBitmap] = value;
    DisplayObject.invalidate(this, DirtyFlags.CacheAsBitmap);
  }

  get cacheAsBitmapMatrix(): Matrix2D | null {
    return this[internal._cacheAsBitmapMatrix];
  }

  set cacheAsBitmapMatrix(value: Matrix2D | null) {
    if (Matrix2D.equals(this[internal._cacheAsBitmapMatrix], value)) return;

    if (value !== null) {
      if (this[internal._cacheAsBitmapMatrix] === null) {
        this[internal._cacheAsBitmapMatrix] = Matrix2D.clone(value);
      } else {
        Matrix2D.copyFrom(this[internal._cacheAsBitmapMatrix] as Matrix2D, value);
      }
    } else {
      this[internal._cacheAsBitmapMatrix] = null;
    }

    if (this[internal._cacheAsBitmap]) {
      DisplayObject.invalidate(this, DirtyFlags.Transform);
    }
  }

  get filters(): BitmapFilter[] {
    const filters = this[internal._filters];
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: BitmapFilter[] | null) {
    if ((value === null || value.length == 0) && this[internal._filters] === null) return;

    if (value !== null) {
      this[internal._filters] = value.map((filter) => {
        return BitmapFilter.clone(filter);
      });
    } else {
      this[internal._filters] = null;
    }

    DisplayObject.invalidate(this, DirtyFlags.CacheAsBitmap);
  }

  get height(): number {
    DisplayObject.__updateTransformedBounds(this);
    return this[internal._transformedBounds].height;
  }

  set height(value: number) {
    DisplayObject.__updateLocalBounds(this);
    if (this[internal._localBounds].height === 0) return;
    // Invalidation (if necessary) occurs in scaleY setter
    this.scaleY = value / this[internal._localBounds].height;
  }

  get loaderInfo(): LoaderInfo | null {
    // If loaderInfo was set by a Loader, return
    if (this[internal._loaderInfo] !== null) return this[internal._loaderInfo];
    // Otherwise return info of root
    return this.root ? this.root[internal._loaderInfo] : null;
  }

  get mask(): DisplayObject | null {
    return this[internal._mask];
  }

  set mask(value: DisplayObject | null) {
    if (value === this[internal._mask]) return;

    if (this[internal._mask] !== null) {
      (this[internal._mask] as DisplayObject)[internal._maskedObject] = null;
    }
    if (value !== null) {
      value[internal._maskedObject] = this;
    }

    this[internal._mask] = value;
    DisplayObject.invalidate(this, DirtyFlags.Clip);
  }

  get name(): string | null {
    return this[internal._name];
  }

  set name(value: string | null) {
    this[internal._name] = value;
  }

  get opaqueBackground(): number | null {
    return this[internal._opaqueBackground];
  }

  set opaqueBackground(value: number | null) {
    if (value === this[internal._opaqueBackground]) return;
    this[internal._opaqueBackground] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get parent(): DisplayObjectContainer | null {
    return this[internal._parent];
  }

  get root(): DisplayObjectContainer | null {
    return this[internal._root];
  }

  get rotation(): number {
    return this[internal._rotationAngle];
  }

  set rotation(value: number) {
    if (value === this[internal._rotationAngle]) return;

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

    this[internal._rotationAngle] = value;
    this[internal._rotationSine] = sin;
    this[internal._rotationCosine] = cos;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scale9Grid(): Rectangle | null {
    if (this[internal._scale9Grid] === null) {
      return null;
    }
    return Rectangle.clone(this[internal._scale9Grid] as Rectangle);
  }

  set scroll9Grid(value: Rectangle | null) {
    if (value === null && this[internal._scale9Grid] === null) return;
    if (
      value !== null &&
      this[internal._scale9Grid] !== null &&
      Rectangle.equals(this[internal._scale9Grid] as Rectangle, value)
    )
      return;

    if (value != null) {
      if (this[internal._scale9Grid] === null) this[internal._scale9Grid] = new Rectangle();
      Rectangle.copyFrom(this[internal._scale9Grid] as Rectangle, value);
    } else {
      this[internal._scale9Grid] = null;
    }

    DisplayObject.invalidate(this, DirtyFlags.Appearance | DirtyFlags.Bounds | DirtyFlags.Clip | DirtyFlags.Transform);
  }

  get scaleX(): number {
    return this[internal._scaleX];
  }

  set scaleX(value: number) {
    if (value === this[internal._scaleX]) return;
    this[internal._scaleX] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scaleY(): number {
    return this[internal._scaleY];
  }

  set scaleY(value: number) {
    if (value === this[internal._scaleY]) return;
    this[internal._scaleY] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scrollRect(): Rectangle | null {
    if (this[internal._scrollRect] === null) {
      return null;
    }
    return Rectangle.clone(this[internal._scrollRect] as Rectangle);
  }

  set scrollRect(value: Rectangle | null) {
    if (value === null && this[internal._scrollRect] === null) return;
    if (
      value !== null &&
      this[internal._scrollRect] !== null &&
      Rectangle.equals(this[internal._scrollRect] as Rectangle, value)
    )
      return;

    if (value !== null) {
      if (this[internal._scrollRect] === null) this[internal._scrollRect] = new Rectangle();
      Rectangle.copyFrom(this[internal._scrollRect] as Rectangle, value);
    } else {
      this[internal._scrollRect] = null;
    }

    this[internal._scrollRect] = value;
    DisplayObject.invalidate(this, DirtyFlags.Clip);
  }

  get shader(): Shader | null {
    return this[internal._shader];
  }

  set shader(value: Shader | null) {
    if (value === this.shader) return;
    this[internal._shader] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get stage(): Stage | null {
    return this[internal._stage];
  }

  get transform(): Transform {
    if (this[internal._transform] === null) {
      this[internal._transform] = new Transform(this);
    }
    return this[internal._transform] as Transform;
  }

  set transform(value: Transform) {
    if (value === null) {
      throw new TypeError('Parameter transform must be non-null.');
    }

    if (this[internal._transform] === null) {
      this[internal._transform] = new Transform(this);
    }

    // if (value.__hasMatrix2D)
    // {
    //     var other = value.__displayObject.__transform;
    //     __objectTransform.__setTransform(other.a, other.b, other.c, other.d, other.tx, other.ty);
    // }
    // else
    // {
    //     __objectTransform.__hasMatrix2D = false;
    // }

    // if (!__objectTransform.__colorTransform.__equals(value.__colorTransform, true)
    //     || (!cacheAsBitmap && __objectTransform.__colorTransform.alphaMultiplier != value.__colorTransform.alphaMultiplier))
    // {
    //     __objectTransform.__colorTransform.__copyFrom(value.colorTransform);
    //     __setRenderDirty();
    // }
  }

  get visible(): boolean {
    return this[internal._visible];
  }

  set visible(value: boolean) {
    if (value === this[internal._visible]) return;
    this[internal._visible] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get width(): number {
    DisplayObject.__updateTransformedBounds(this);
    return this[internal._transformedBounds].width;
  }

  set width(value: number) {
    DisplayObject.__updateLocalBounds(this);
    if (this[internal._localBounds].width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / this[internal._localBounds].width;
  }

  get x(): number {
    return this[internal._x];
  }

  set x(value: number) {
    if (value !== value) value = 0; // Flash converts NaN to 0
    if (value === this[internal._x]) return;
    this[internal._x] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get y(): number {
    return this[internal._y];
  }

  set y(value: number) {
    if (value !== value) value = 0; // Flash converts NaN to 0
    if (value === this[internal._y]) return;
    this[internal._y] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }
}
