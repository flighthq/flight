import { MatrixPool, Point, Rectangle, RectanglePool } from '@flighthq/core';
import { Matrix } from '@flighthq/core';

import type { BitmapDrawable } from './BitmapDrawable.js';
import { BlendMode } from './BlendMode.js';
import { DirtyFlags } from './DirtyFlags.js';
import BitmapFilter from './filters/BitmapFilter.js';
import type LoaderInfo from './LoaderInfo.js';
import type Shader from './Shader.js';
import type Stage from './Stage.js';
import Transform from './Transform.js';

export default class DisplayObject implements BitmapDrawable {
  static __tempPoint: Point = new Point();

  protected __alpha: number = 1.0;
  protected __blendMode: BlendMode = BlendMode.Normal;
  protected __cacheAsBitmap: boolean = false;
  protected __cacheAsBitmapMatrix: Matrix | null = null;
  protected __filters: BitmapFilter[] | null = null;
  protected __dirtyFlags: DirtyFlags = DirtyFlags.None;
  protected __height: number = 0;
  protected __loaderInfo: LoaderInfo | null = null;
  protected __localBounds: Rectangle = new Rectangle();
  protected __localBoundsID: number = 0;
  protected __localTransform: Matrix = new Matrix();
  protected __localTransformID: number = 0;
  protected __mask: DisplayObject | null = null;
  protected __maskedObject: DisplayObject | null = null;
  protected __name: string | null = null;
  protected __opaqueBackground: number | null = null;
  protected __parent: DisplayObject | null = null;
  protected __parentTransformID: number = 0;
  protected __root: DisplayObject | null = null;
  protected __rotationAngle: number = 0;
  protected __rotationCosine: number = 1;
  protected __rotationSine: number = 0;
  protected __scale9Grid: Rectangle | null = null;
  protected __scaleX: number = 1;
  protected __scaleY: number = 1;
  protected __scrollRect: Rectangle | null = null;
  protected __shader: Shader | null = null;
  protected __stage: Stage | null = null;
  protected __transform: Transform | null = null;
  protected __transformedBounds: Rectangle = new Rectangle();
  protected __width: number = 0;
  protected __worldTransform: Matrix = new Matrix();
  protected __worldTransformID: number = 0;
  protected __visible: boolean = true;
  protected __x: number = 0;
  protected __y: number = 0;

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
      const transform = MatrixPool.get();
      Matrix.inverse(transform, targetCoordinateSpace.__worldTransform);
      Matrix.multiply(transform, transform, source.__worldTransform);
      Matrix.transformRectTo(out, transform, source.__localBounds);
      MatrixPool.release(transform);
    } else {
      Rectangle.copyFrom(out, source.__localBounds);
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
    Matrix.inverseTransformXY(out, source.__worldTransform, pos.x, pos.y);
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  static hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
    if (other.__parent !== null && source.__parent !== null) {
      this.__updateLocalBounds(source);
      const sourceBounds = source.__localBounds;
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
    if (!source.__visible || source.__opaqueBackground === null) return false;
    this.__updateWorldTransform(source);
    Matrix.inverseTransformXY(this.__tempPoint, source.__worldTransform, x, y);
    this.__updateLocalBounds(source);
    return Rectangle.contains(source.__localBounds, this.__tempPoint.x, this.__tempPoint.y);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  static invalidate(target: DisplayObject, flags: DirtyFlags = DirtyFlags.Render): void {
    if ((target.__dirtyFlags & flags) === flags) return;

    target.__dirtyFlags |= flags;

    if ((flags & DirtyFlags.Transform) !== 0) {
      // If transform changed, transformed bounds must also be updated
      target.__dirtyFlags |= DirtyFlags.TransformedBounds;
      target.__localTransformID++;
    }

    if ((flags & DirtyFlags.Bounds) !== 0) {
      // Changing local bounds also requires transformed bounds update
      target.__dirtyFlags |= DirtyFlags.TransformedBounds;
      target.__localBoundsID++;
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
    Matrix.transformXY(out, source.__worldTransform, point.x, point.y);
  }

  private static __updateLocalBounds(target: DisplayObject): void {
    if ((target.__dirtyFlags & DirtyFlags.Bounds) === 0) return;

    // TODO, update __localBounds

    target.__dirtyFlags &= ~DirtyFlags.Bounds;
  }

  private static __updateLocalTransform(target: DisplayObject): void {
    if ((target.__dirtyFlags & DirtyFlags.Transform) === 0) return;

    const matrix = target.__localTransform;
    matrix.a = target.__rotationCosine * target.__scaleX;
    matrix.b = target.__rotationSine * target.__scaleX;
    matrix.c = -target.__rotationSine * target.__scaleY;
    matrix.d = target.__rotationCosine * target.__scaleY;
    matrix.tx = target.__x;
    matrix.ty = target.__y;

    target.__dirtyFlags &= ~DirtyFlags.Transform;
  }

  private static __updateTransformedBounds(target: DisplayObject): void {
    if ((target.__dirtyFlags & DirtyFlags.TransformedBounds) === 0) return;

    this.__updateLocalBounds(target);
    this.__updateLocalTransform(target);

    Matrix.transformRectTo(target.__transformedBounds, target.__localTransform, target.__localBounds);

    target.__dirtyFlags &= ~DirtyFlags.TransformedBounds;
  }

  private static __updateWorldTransform(target: DisplayObject): void {
    // Recursively allow parents to update if out-of-date
    if (target.__parent !== null) {
      this.__updateWorldTransform(target.__parent);
    }
    const parentTransformID = target.__parent !== null ? target.__parent.__worldTransformID : 0;
    // Update if local transform ID or parent world transform ID changed
    if (target.__worldTransformID !== target.__localTransformID || target.__parentTransformID !== parentTransformID) {
      // Ensure local transform is accurate
      this.__updateLocalTransform(target);
      if (target.__parent !== null) {
        Matrix.multiply(target.__worldTransform, target.__parent.__worldTransform, target.__localTransform);
      } else {
        Matrix.copyFrom(target.__worldTransform, target.__localTransform);
      }
      target.__parentTransformID = parentTransformID;
      target.__worldTransformID = target.__localTransformID;
    }
  }

  // Get & Set Methods

  get alpha(): number {
    return this.__alpha;
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this.__alpha) return;
    this.__alpha = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get blendMode(): BlendMode {
    return this.__blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this.__blendMode) return;
    this.__blendMode = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get cacheAsBitmap(): boolean {
    return this.__filters === null ? this.__cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this.__cacheAsBitmap) return;
    this.__cacheAsBitmap = value;
    DisplayObject.invalidate(this, DirtyFlags.CacheAsBitmap);
  }

  get cacheAsBitmapMatrix(): Matrix | null {
    return this.__cacheAsBitmapMatrix;
  }

  set cacheAsBitmapMatrix(value: Matrix | null) {
    if (Matrix.equals(this.__cacheAsBitmapMatrix, value)) return;

    if (value !== null) {
      if (this.__cacheAsBitmapMatrix === null) {
        this.__cacheAsBitmapMatrix = Matrix.clone(value);
      } else {
        Matrix.copyFrom(this.__cacheAsBitmapMatrix, value);
      }
    } else {
      this.__cacheAsBitmapMatrix = null;
    }

    if (this.__cacheAsBitmap) {
      DisplayObject.invalidate(this, DirtyFlags.Transform);
    }
  }

  get filters(): BitmapFilter[] {
    if (this.__filters === null) {
      return [];
    } else {
      return this.__filters.slice();
    }
  }

  set filters(value: BitmapFilter[] | null) {
    if ((value === null || value.length == 0) && this.__filters === null) return;

    if (value !== null) {
      this.__filters = value.map((filter) => {
        return BitmapFilter.clone(filter);
      });
    } else {
      this.__filters = null;
    }

    DisplayObject.invalidate(this, DirtyFlags.CacheAsBitmap);
  }

  get height(): number {
    DisplayObject.__updateTransformedBounds(this);
    return this.__transformedBounds.height;
  }

  set height(value: number) {
    DisplayObject.__updateLocalBounds(this);
    if (this.__localBounds.height === 0) return;
    // Invalidation (if necessary) occurs in scaleY setter
    this.scaleY = value / this.__localBounds.height;
  }

  get loaderInfo(): LoaderInfo | null {
    // If loaderInfo was set by a Loader, return
    if (this.__loaderInfo !== null) return this.__loaderInfo;
    // Otherwise return info of root
    return this.root?.__loaderInfo ?? null;
  }

  get mask(): DisplayObject | null {
    return this.__mask;
  }

  set mask(value: DisplayObject | null) {
    if (value === this.__mask) return;

    if (this.__mask !== null) {
      this.__mask.__maskedObject = null;
    }
    if (value !== null) {
      value.__maskedObject = this;
    }

    this.__mask = value;
    DisplayObject.invalidate(this, DirtyFlags.Clip);
  }

  get name(): string | null {
    return this.__name;
  }

  set name(value: string | null) {
    this.__name = value;
  }

  get opaqueBackground(): number | null {
    return this.__opaqueBackground;
  }

  set opaqueBackground(value: number | null) {
    if (value === this.__opaqueBackground) return;
    this.__opaqueBackground = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get parent(): DisplayObject | null {
    return this.__parent;
  }

  get root(): DisplayObject | null {
    return this.__root;
  }

  get rotation(): number {
    return this.__rotationAngle;
  }

  set rotation(value: number) {
    if (value === this.__rotationAngle) return;

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

    this.__rotationAngle = value;
    this.__rotationSine = sin;
    this.__rotationCosine = cos;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scale9Grid(): Rectangle | null {
    if (this.__scale9Grid == null) {
      return null;
    }
    return Rectangle.clone(this.__scale9Grid);
  }

  set scroll9Grid(value: Rectangle | null) {
    if (value === null && this.__scale9Grid === null) return;
    if (value !== null && this.__scale9Grid !== null && Rectangle.equals(this.__scale9Grid, value)) return;

    if (value != null) {
      if (this.__scale9Grid === null) this.__scale9Grid = new Rectangle();
      Rectangle.copyFrom(this.__scale9Grid, value);
    } else {
      this.__scale9Grid = null;
    }

    DisplayObject.invalidate(this, DirtyFlags.Appearance | DirtyFlags.Bounds | DirtyFlags.Clip | DirtyFlags.Transform);
  }

  get scaleX(): number {
    return this.__scaleX;
  }

  set scaleX(value: number) {
    if (value === this.__scaleX) return;
    this.__scaleX = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scaleY(): number {
    return this.__scaleY;
  }

  set scaleY(value: number) {
    if (value === this.__scaleY) return;
    this.__scaleY = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scrollRect(): Rectangle | null {
    if (this.__scrollRect === null) {
      return null;
    }
    return Rectangle.clone(this.__scrollRect);
  }

  set scrollRect(value: Rectangle | null) {
    if (value === null && this.__scrollRect === null) return;
    if (value !== null && this.__scrollRect !== null && Rectangle.equals(this.__scrollRect, value)) return;

    if (value !== null) {
      if (this.__scrollRect === null) this.__scrollRect = new Rectangle();
      Rectangle.copyFrom(this.__scrollRect, value);
    } else {
      this.__scrollRect = null;
    }

    this.__scrollRect = value;
    DisplayObject.invalidate(this, DirtyFlags.Clip);
  }

  get shader(): Shader | null {
    return this.__shader;
  }

  set shader(value: Shader | null) {
    if (value === this.shader) return;
    this.__shader = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get stage(): Stage | null {
    return this.__stage;
  }

  get transform(): Transform {
    if (this.__transform === null) {
      this.__transform = new Transform(this);
    }
    return this.__transform;
  }

  set transform(value: Transform) {
    if (value === null) {
      throw new TypeError('Parameter transform must be non-null.');
    }

    if (this.__transform === null) {
      this.__transform = new Transform(this);
    }

    // if (value.__hasMatrix)
    // {
    //     var other = value.__displayObject.__transform;
    //     __objectTransform.__setTransform(other.a, other.b, other.c, other.d, other.tx, other.ty);
    // }
    // else
    // {
    //     __objectTransform.__hasMatrix = false;
    // }

    // if (!__objectTransform.__colorTransform.__equals(value.__colorTransform, true)
    //     || (!cacheAsBitmap && __objectTransform.__colorTransform.alphaMultiplier != value.__colorTransform.alphaMultiplier))
    // {
    //     __objectTransform.__colorTransform.__copyFrom(value.colorTransform);
    //     __setRenderDirty();
    // }
  }

  get visible(): boolean {
    return this.__visible;
  }

  set visible(value: boolean) {
    if (value === this.__visible) return;
    this.__visible = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get width(): number {
    DisplayObject.__updateTransformedBounds(this);
    return this.__transformedBounds.width;
  }

  set width(value: number) {
    DisplayObject.__updateLocalBounds(this);
    if (this.__localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / this.__localBounds.width;
  }

  get x(): number {
    return this.__x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // Flash converts NaN to 0
    if (value === this.__x) return;
    this.__x = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get y(): number {
    return this.__y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // Flash converts NaN to 0
    if (value === this.__y) return;
    this.__y = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }
}
