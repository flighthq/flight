import type { Renderable } from '@flighthq/contracts';
import { RenderableSymbols as R } from '@flighthq/contracts';
import { Matrix2D, Matrix2DPool, Point, Rectangle, RectanglePool } from '@flighthq/math';
import type { Shader } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { DirtyFlags } from './DirtyFlags.js';
import type DisplayObjectContainer from './DisplayObjectContainer.js';
import BitmapFilter from './filters/BitmapFilter.js';
import { internal as $ } from './internal/DisplayObject.js';
import type LoaderInfo from './LoaderInfo.js';
import type Stage from './Stage.js';
import Transform from './Transform.js';

export default class DisplayObject implements Renderable {
  private static __tempPoint: Point = new Point();

  // Renderable contract
  [R.alpha]: number = 1;
  [R.blendMode]: BlendMode = BlendMode.Normal;
  [R.bounds]: Rectangle = new Rectangle();
  [R.cacheAsBitmap]: boolean = false;
  [R.cacheAsBitmapMatrix]: Matrix2D | null = null;
  [R.children]: DisplayObject[] | null = null;
  [R.filters]: BitmapFilter[] | null = null;
  [R.height]: number = 0;
  [R.localBounds]: Rectangle = new Rectangle();
  [R.localBoundsID]: number = 0;
  [R.localTransform]: Matrix2D = new Matrix2D();
  [R.localTransformID]: number = 0;
  [R.mask]: DisplayObject | null = null;
  [R.maskedObject]: DisplayObject | null = null;
  [R.name]: string | null = null;
  [R.opaqueBackground]: number | null = null;
  [R.parent]: DisplayObjectContainer | null = null;
  [R.parentTransformID]: number = 0;
  [R.rotationAngle]: number = 0;
  [R.rotationCosine]: number = 1;
  [R.rotationSine]: number = 0;
  [R.scale9Grid]: Rectangle | null = null;
  [R.scaleX]: number = 1;
  [R.scaleY]: number = 1;
  [R.scrollRect]: Rectangle | null = null;
  [R.shader]: Shader | null = null;
  [R.width]: number = 0;
  [R.worldBounds]: Rectangle = new Rectangle();
  [R.worldTransform]: Matrix2D = new Matrix2D();
  [R.worldTransformID]: number = 0;
  [R.visible]: boolean = true;
  [R.x]: number = 0;
  [R.y]: number = 0;

  // Scene internal
  [$._dirtyFlags]: DirtyFlags = DirtyFlags.None;
  [$._loaderInfo]: LoaderInfo | null = null;
  [$._root]: DisplayObjectContainer | null = null;
  [$._stage]: Stage | null = null;
  [$._transform]: Transform | null = null;

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
    if (source !== targetCoordinateSpace) source[R.updateWorldTransform]();
    if (targetCoordinateSpace !== null && targetCoordinateSpace !== source) {
      targetCoordinateSpace[R.updateWorldTransform]();
      source[R.updateLocalBounds]();
      const transform = Matrix2DPool.get();
      Matrix2D.inverse(transform, targetCoordinateSpace[R.worldTransform]);
      Matrix2D.multiply(transform, transform, source[R.worldTransform]);
      Matrix2D.transformRectTo(out, transform, source[R.localBounds]);
      Matrix2DPool.release(transform);
    } else {
      Rectangle.copyFrom(out, source[R.localBounds]);
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
    source[R.updateWorldTransform]();
    Matrix2D.inverseTransformXY(out, source[R.worldTransform], pos.x, pos.y);
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  static hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
    if (other[R.parent] !== null && source[R.parent] !== null) {
      source[R.updateLocalBounds]();
      const sourceBounds = source[R.localBounds];
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
    if (!source[R.visible] || source[R.opaqueBackground] === null) return false;
    source[R.updateWorldTransform]();
    Matrix2D.inverseTransformXY(this.__tempPoint, source[R.worldTransform], x, y);
    source[R.updateLocalBounds]();
    return Rectangle.contains(source[R.localBounds], this.__tempPoint.x, this.__tempPoint.y);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  static invalidate(target: DisplayObject, flags: DirtyFlags = DirtyFlags.Render): void {
    if ((target[$._dirtyFlags] & flags) === flags) return;

    target[$._dirtyFlags] |= flags;

    if ((flags & DirtyFlags.Transform) !== 0) {
      // If transform changed, transformed bounds must also be updated
      target[$._dirtyFlags] |= DirtyFlags.TransformedBounds;
      target[R.localTransformID]++;
    }

    if ((flags & DirtyFlags.Bounds) !== 0) {
      // Changing local bounds also requires transformed bounds update
      target[$._dirtyFlags] |= DirtyFlags.TransformedBounds;
      target[R.localBoundsID]++;
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
    source[R.updateWorldTransform]();
    Matrix2D.transformXY(out, source[R.worldTransform], point.x, point.y);
  }

  [R.update](): void {
    this[R.updateBounds]();
    this[R.updateWorldBounds]();
  }

  [R.updateLocalBounds](): void {
    if ((this[$._dirtyFlags] & DirtyFlags.Bounds) === 0) return;

    // TODO, update __localBounds

    this[$._dirtyFlags] &= ~DirtyFlags.Bounds;
  }

  [R.updateLocalTransform](): void {
    if ((this[$._dirtyFlags] & DirtyFlags.Transform) === 0) return;

    const matrix = this[R.localTransform];
    matrix.a = this[R.rotationCosine] * this[R.scaleX];
    matrix.b = this[R.rotationSine] * this[R.scaleX];
    matrix.c = -this[R.rotationSine] * this[R.scaleY];
    matrix.d = this[R.rotationCosine] * this[R.scaleY];
    matrix.tx = this[R.x];
    matrix.ty = this[R.y];

    this[$._dirtyFlags] &= ~DirtyFlags.Transform;
  }

  [R.updateBounds](): void {
    if ((this[$._dirtyFlags] & DirtyFlags.TransformedBounds) === 0) return;

    this[R.updateLocalBounds]();
    this[R.updateLocalTransform]();

    Matrix2D.transformRectTo(this[R.bounds], this[R.localTransform], this[R.localBounds]);

    this[$._dirtyFlags] &= ~DirtyFlags.TransformedBounds;
  }

  [R.updateWorldBounds](): void {
    this[R.updateWorldTransform]();

    // TODO: Cache
    Matrix2D.transformRectTo(this[R.worldBounds], this[R.worldTransform], this[R.bounds]);
  }

  [R.updateWorldTransform](): void {
    // Recursively allow parents to update if out-of-date
    const parent = this[R.parent];
    if (parent !== null) {
      parent[R.updateWorldTransform]();
    }
    const parentTransformID = parent !== null ? parent[R.worldTransformID] : 0;
    // Update if local transform ID or parent world transform ID changed
    if (this[R.worldTransformID] !== this[R.localTransformID] || this[R.parentTransformID] !== parentTransformID) {
      // Ensure local transform is accurate
      this[R.updateLocalTransform]();
      if (parent !== null) {
        Matrix2D.multiply(this[R.worldTransform], parent[R.worldTransform], this[R.localTransform]);
      } else {
        Matrix2D.copyFrom(this[R.worldTransform], this[R.localTransform]);
      }
      this[R.parentTransformID] = parentTransformID;
      this[R.worldTransformID] = this[R.localTransformID];
    }
  }

  // Get & Set Methods

  get alpha(): number {
    return this[R.alpha];
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this[R.alpha]) return;
    this[R.alpha] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get blendMode(): BlendMode {
    return this[R.blendMode];
  }

  set blendMode(value: BlendMode) {
    if (value === this[R.blendMode]) return;
    this[R.blendMode] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get cacheAsBitmap(): boolean {
    return this[R.filters] === null ? this[R.cacheAsBitmap] : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this[R.cacheAsBitmap]) return;
    this[R.cacheAsBitmap] = value;
    DisplayObject.invalidate(this, DirtyFlags.CacheAsBitmap);
  }

  get cacheAsBitmapMatrix(): Matrix2D | null {
    return this[R.cacheAsBitmapMatrix];
  }

  set cacheAsBitmapMatrix(value: Matrix2D | null) {
    if (Matrix2D.equals(this[R.cacheAsBitmapMatrix], value)) return;

    if (value !== null) {
      if (this[R.cacheAsBitmapMatrix] === null) {
        this[R.cacheAsBitmapMatrix] = Matrix2D.clone(value);
      } else {
        Matrix2D.copyFrom(this[R.cacheAsBitmapMatrix] as Matrix2D, value);
      }
    } else {
      this[R.cacheAsBitmapMatrix] = null;
    }

    if (this[R.cacheAsBitmap]) {
      DisplayObject.invalidate(this, DirtyFlags.Transform);
    }
  }

  get filters(): BitmapFilter[] {
    const filters = this[R.filters];
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: BitmapFilter[] | null) {
    if ((value === null || value.length == 0) && this[R.filters] === null) return;

    if (value !== null) {
      this[R.filters] = value.map((filter) => {
        return BitmapFilter.clone(filter);
      });
    } else {
      this[R.filters] = null;
    }

    DisplayObject.invalidate(this, DirtyFlags.CacheAsBitmap);
  }

  get height(): number {
    this[R.updateBounds]();
    return this[R.bounds].height;
  }

  set height(value: number) {
    this[R.updateLocalBounds]();
    if (this[R.localBounds].height === 0) return;
    // Invalidation (if necessary) occurs in scaleY setter
    this.scaleY = value / this[R.localBounds].height;
  }

  get loaderInfo(): LoaderInfo | null {
    // If loaderInfo was set by a Loader, return
    if (this[$._loaderInfo] !== null) return this[$._loaderInfo];
    // Otherwise return info of root
    return this.root ? this.root[$._loaderInfo] : null;
  }

  get mask(): DisplayObject | null {
    return this[R.mask];
  }

  set mask(value: DisplayObject | null) {
    if (value === this[R.mask]) return;

    if (this[R.mask] !== null) {
      (this[R.mask] as DisplayObject)[R.maskedObject] = null;
    }
    if (value !== null) {
      value[R.maskedObject] = this;
    }

    this[R.mask] = value;
    DisplayObject.invalidate(this, DirtyFlags.Clip);
  }

  get name(): string | null {
    return this[R.name];
  }

  set name(value: string | null) {
    this[R.name] = value;
  }

  get opaqueBackground(): number | null {
    return this[R.opaqueBackground];
  }

  set opaqueBackground(value: number | null) {
    if (value === this[R.opaqueBackground]) return;
    this[R.opaqueBackground] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get parent(): DisplayObjectContainer | null {
    return this[R.parent];
  }

  get root(): DisplayObjectContainer | null {
    return this[$._root];
  }

  get rotation(): number {
    return this[R.rotationAngle];
  }

  set rotation(value: number) {
    if (value === this[R.rotationAngle]) return;

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

    this[R.rotationAngle] = value;
    this[R.rotationSine] = sin;
    this[R.rotationCosine] = cos;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scale9Grid(): Rectangle | null {
    if (this[R.scale9Grid] === null) {
      return null;
    }
    return Rectangle.clone(this[R.scale9Grid] as Rectangle);
  }

  set scroll9Grid(value: Rectangle | null) {
    if (value === null && this[R.scale9Grid] === null) return;
    if (value !== null && this[R.scale9Grid] !== null && Rectangle.equals(this[R.scale9Grid] as Rectangle, value))
      return;

    if (value != null) {
      if (this[R.scale9Grid] === null) this[R.scale9Grid] = new Rectangle();
      Rectangle.copyFrom(this[R.scale9Grid] as Rectangle, value);
    } else {
      this[R.scale9Grid] = null;
    }

    DisplayObject.invalidate(this, DirtyFlags.Appearance | DirtyFlags.Bounds | DirtyFlags.Clip | DirtyFlags.Transform);
  }

  get scaleX(): number {
    return this[R.scaleX];
  }

  set scaleX(value: number) {
    if (value === this[R.scaleX]) return;
    this[R.scaleX] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scaleY(): number {
    return this[R.scaleY];
  }

  set scaleY(value: number) {
    if (value === this[R.scaleY]) return;
    this[R.scaleY] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get scrollRect(): Rectangle | null {
    if (this[R.scrollRect] === null) {
      return null;
    }
    return Rectangle.clone(this[R.scrollRect] as Rectangle);
  }

  set scrollRect(value: Rectangle | null) {
    if (value === null && this[R.scrollRect] === null) return;
    if (value !== null && this[R.scrollRect] !== null && Rectangle.equals(this[R.scrollRect] as Rectangle, value))
      return;

    if (value !== null) {
      if (this[R.scrollRect] === null) this[R.scrollRect] = new Rectangle();
      Rectangle.copyFrom(this[R.scrollRect] as Rectangle, value);
    } else {
      this[R.scrollRect] = null;
    }

    this[R.scrollRect] = value;
    DisplayObject.invalidate(this, DirtyFlags.Clip);
  }

  get shader(): Shader | null {
    return this[R.shader];
  }

  set shader(value: Shader | null) {
    if (value === this.shader) return;
    this[R.shader] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get stage(): Stage | null {
    return this[$._stage];
  }

  get transform(): Transform {
    if (this[$._transform] === null) {
      this[$._transform] = new Transform(this);
    }
    return this[$._transform] as Transform;
  }

  set transform(value: Transform) {
    if (value === null) {
      throw new TypeError('Parameter transform must be non-null.');
    }

    if (this[$._transform] === null) {
      this[$._transform] = new Transform(this);
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
    return this[R.visible];
  }

  set visible(value: boolean) {
    if (value === this[R.visible]) return;
    this[R.visible] = value;
    DisplayObject.invalidate(this, DirtyFlags.Appearance);
  }

  get width(): number {
    this[R.updateBounds]();
    return this[R.bounds].width;
  }

  set width(value: number) {
    this[R.updateLocalBounds]();
    if (this[R.localBounds].width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / this[R.localBounds].width;
  }

  get x(): number {
    return this[R.x];
  }

  set x(value: number) {
    if (value !== value) value = 0; // Flash converts NaN to 0
    if (value === this[R.x]) return;
    this[R.x] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }

  get y(): number {
    return this[R.y];
  }

  set y(value: number) {
    if (value !== value) value = 0; // Flash converts NaN to 0
    if (value === this[R.y]) return;
    this[R.y] = value;
    DisplayObject.invalidate(this, DirtyFlags.Transform);
  }
}
