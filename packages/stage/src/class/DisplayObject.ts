import { Affine2D, Rectangle, Vector2 } from '@flighthq/math';
import type {
  Affine2D as Affine2DLike,
  BitmapFilter as BitmapFilterLike,
  DisplayObject as DisplayObjectLike,
  DisplayObjectContainer as DisplayObjectContainerLike,
  LoaderInfo,
  Rectangle as RectangleLike,
  Shader,
  Stage as StageLike,
  Vector2 as Vector2Like,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';
import { DirtyFlags, DisplayObjectDerivedState } from '@flighthq/types';

import * as functions from '../functions/displayObject.js';
import type Stage from './Stage.js';
import Transform from './Transform.js';

export default class DisplayObject implements DisplayObjectLike {
  protected __alpha: number = 1;
  protected __blendMode: BlendMode = BlendMode.Normal;
  protected __cacheAsBitmap: boolean = false;
  protected __cacheAsBitmapMatrix: Affine2DLike | null = null;
  protected __filters: BitmapFilterLike[] | null = null;
  protected __loaderInfo: LoaderInfo | null = null;
  protected __mask: DisplayObjectLike | null = null;
  protected __name: string | null = null;
  protected __opaqueBackground: number | null = null;
  protected __parent: DisplayObjectContainerLike | null = null;
  protected __root: DisplayObjectContainerLike | null = null;
  protected __rotation: number = 0;
  protected __scaleX: number = 1;
  protected __scaleY: number = 1;
  protected __scale9Grid: RectangleLike | null = null;
  protected __scrollRect: RectangleLike | null = null;
  protected __shader: Shader | null = null;
  protected __stage: StageLike | null = null;
  protected __transform: Transform | null = null;
  protected __visible: boolean = true;
  protected __x: number = 0;
  protected __y: number = 0;

  [DisplayObjectDerivedState.Key]?: DisplayObjectDerivedState;

  constructor() {
    functions.create(this);
  }

  /**
   * Returns a rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object.
   *
   * Returns a new Rectangle()
   **/
  getBounds(targetCoordinateSpace: DisplayObject | null): Rectangle {
    const out = new Rectangle();
    functions.getBounds(out, this, targetCoordinateSpace);
    return out;
  }

  /**
   * Returns a rectangle that defines the boundary of the display object, based
   * on the coordinate system defined by the `targetCoordinateSpace`
   * parameter, excluding any strokes on shapes. The values that the
   * `getRect()` method returns are the same or smaller than those
   * returned by the `getBounds()` method.
   *
   * Returns a new Rectangle()
   **/
  getRect(targetCoordinateSpace: DisplayObject | null | undefined): Rectangle {
    const out = new Rectangle();
    functions.getRect(out, this, targetCoordinateSpace);
    return out;
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   **/
  globalToLocal(pos: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    functions.globalToLocal(out, this, pos);
    return out;
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  hitTestObject(other: DisplayObject): boolean {
    return functions.hitTestObject(this, other);
  }

  /**
		Evaluates the display object to see if it overlaps or intersects with the
		point specified by the `x` and `y` parameters in world coordinates.

    @param shapeFlag Whether to check against the actual pixels of the object
						(`true`) or the bounding box
						(`false`).
	**/
  hitTestPoint(x: number, y: number, _shapeFlag: boolean = false): boolean {
    return functions.hitTestPoint(this, x, y, _shapeFlag);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  invalidate(flags: DirtyFlags = DirtyFlags.Render): void {
    functions.invalidate(this, flags);
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   **/
  localToGlobal(point: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    functions.localToGlobal(out, this, point);
    return out;
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
    this.invalidate(DirtyFlags.Appearance);
  }

  get blendMode(): BlendMode {
    return this.__blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this.__blendMode) return;
    this.__blendMode = value;
    this.invalidate(DirtyFlags.Appearance);
  }

  get cacheAsBitmap(): boolean {
    return this.__filters === null ? this.__cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this.__cacheAsBitmap) return;
    this.__cacheAsBitmap = value;
    this.invalidate(DirtyFlags.CacheAsBitmap);
  }

  get cacheAsBitmapMatrix(): Affine2DLike | null {
    return this.__cacheAsBitmapMatrix;
  }

  set cacheAsBitmapMatrix(value: Affine2DLike | null) {
    if (Affine2D.equals(this.__cacheAsBitmapMatrix, value)) return;

    if (value !== null) {
      if (this.__cacheAsBitmapMatrix === null) {
        this.__cacheAsBitmapMatrix = Affine2D.clone(value);
      } else {
        Affine2D.copy(this.__cacheAsBitmapMatrix as Affine2D, value);
      }
    } else {
      this.__cacheAsBitmapMatrix = null;
    }

    if (this.__cacheAsBitmap) {
      this.invalidate(DirtyFlags.Transform);
    }
  }

  get filters(): BitmapFilterLike[] {
    const filters = this.__filters;
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: BitmapFilterLike[] | null) {
    if ((value === null || value.length == 0) && this.__filters === null) return;

    // if (value !== null) {
    //   target[$.filters] = value.map((filter) => {
    //     return filter.clone();
    //   });
    // } else {
    this.__filters = null;
    // }

    this.invalidate(DirtyFlags.CacheAsBitmap);
  }

  get height(): number {
    return functions.getCurrentBounds(this).height;
  }

  set height(value: number) {
    const localBounds = functions.getCurrentLocalBounds(this);
    if (localBounds.height === 0) return;
    // Invalidation (if necessary) occurs in scaleY setter
    this.scaleY = value / localBounds.height;
  }

  get loaderInfo(): LoaderInfo | null {
    // If loaderInfo was set by a Loader, return
    if (this.__loaderInfo !== null) return this.__loaderInfo;
    // Otherwise return info of root
    return (this.__root as DisplayObject)?.__loaderInfo ?? null;
  }

  get mask(): DisplayObjectLike | null {
    return this.__mask;
  }

  set mask(value: DisplayObjectLike | null) {
    if (value === this.__mask) return;

    // if (this.__mask !== null) {
    //   (this.__mask as DisplayObject)[$.maskedObject] = null;
    // }
    // if (value !== null) {
    //   value.__maskedObject = target;
    // }

    this.__mask = value;
    this.invalidate(DirtyFlags.Clip);
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
    this.invalidate(DirtyFlags.Appearance);
  }

  get parent(): DisplayObjectContainerLike | null {
    return this.__parent;
  }

  get root(): DisplayObjectContainerLike | null {
    return this.__root;
  }

  get rotation(): number {
    return this.__rotation;
  }

  set rotation(value: number) {
    if (value === this.__rotation) return;
    // Normalize from -180 to 180
    value = value % 360.0;
    if (value > 180.0) {
      value -= 360.0;
    } else if (value < -180.0) {
      value += 360.0;
    }
    this.__rotation = value;
    this.invalidate(DirtyFlags.Transform);
  }

  get scale9Grid(): RectangleLike | null {
    if (this.__scale9Grid === null) {
      return null;
    }
    return Rectangle.clone(this.__scale9Grid);
  }

  set scale9Grid(value: RectangleLike | null) {
    if (value === null && this.__scale9Grid === null) return;
    if (value !== null && this.__scale9Grid !== null && Rectangle.equals(this.__scale9Grid, value)) return;

    if (value != null) {
      if (this.__scale9Grid === null) this.__scale9Grid = new Rectangle();
      Rectangle.copy(this.__scale9Grid, value);
    } else {
      this.__scale9Grid = null;
    }

    this.invalidate(DirtyFlags.Appearance | DirtyFlags.Bounds | DirtyFlags.Clip | DirtyFlags.Transform);
  }

  get scaleX(): number {
    return this.__scaleX;
  }

  set scaleX(value: number) {
    if (value === this.__scaleX) return;
    this.__scaleX = value;
    this.invalidate(DirtyFlags.Transform);
  }

  get scaleY(): number {
    return this.__scaleY;
  }

  set scaleY(value: number) {
    if (value === this.__scaleY) return;
    this.__scaleY = value;
    this.invalidate(DirtyFlags.Transform);
  }

  get scrollRect(): RectangleLike | null {
    if (this.__scrollRect === null) {
      return null;
    }
    return Rectangle.clone(this.__scrollRect);
  }

  set scrollRect(value: RectangleLike | null) {
    if (value === null && this.__scrollRect === null) return;
    if (value !== null && this.__scrollRect !== null && Rectangle.equals(this.__scrollRect, value)) return;

    if (value !== null) {
      if (this.__scrollRect === null) this.__scrollRect = new Rectangle();
      Rectangle.copy(this.__scrollRect, value);
    } else {
      this.__scrollRect = null;
    }

    this.invalidate(DirtyFlags.Clip);
  }

  get shader(): Shader | null {
    return this.__shader;
  }

  set shader(value: Shader | null) {
    if (value === this.__shader) return;
    this.__shader = value;
    this.invalidate(DirtyFlags.Appearance);
  }

  get stage(): StageLike | null {
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

  get visible(): boolean {
    return this.__visible;
  }

  set visible(value: boolean) {
    if (value === this.__visible) return;
    this.__visible = value;
    this.invalidate(DirtyFlags.Appearance);
  }

  get width(): number {
    return functions.getCurrentBounds(this).width;
  }

  set width(value: number) {
    const localBounds = functions.getCurrentLocalBounds(this);
    if (localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / localBounds.width;
  }

  get x(): number {
    return this.__x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__x) return;
    this.__x = value;
    this.invalidate(DirtyFlags.Transform);
  }

  get y(): number {
    return this.__y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__y) return;
    this.__y = value;
    this.invalidate(DirtyFlags.Transform);
  }
}
