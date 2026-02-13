import { matrix2D, rectangle, vector2 } from '@flighthq/math';
import { bounds, createDisplayObject, derived, dirty, hitTest, transform } from '@flighthq/stage';
import type {
  BitmapFilter as BitmapFilterLike,
  DisplayObject as DisplayObjectLike,
  DisplayObjectContainer as DisplayObjectContainerLike,
  LoaderInfo,
  Matrix2D as Matrix2DLike,
  Rectangle as RectangleLike,
  Shader,
  Stage as StageLike,
  Vector2 as Vector2Like,
} from '@flighthq/types';
import type { BlendMode } from '@flighthq/types';
import { DirtyFlags, DisplayObjectDerivedState } from '@flighthq/types';

import Transform from './Transform.js';

export default class DisplayObject implements DisplayObjectLike {
  protected __data: DisplayObjectLike;
  protected __loaderInfo: LoaderInfo | null = null;
  protected __root: DisplayObjectContainerLike | null = null;
  protected __transform: Transform | null = null;

  [DisplayObjectDerivedState.Key]?: DisplayObjectDerivedState;

  constructor() {
    this.__data = createDisplayObject();
  }

  /**
   * Returns a rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object.
   *
   * Returns a rectangle.create()
   **/
  getBounds(targetCoordinateSpace: DisplayObjectLike | null): RectangleLike {
    const out = rectangle.create();
    bounds.getBounds(out, this.__data, targetCoordinateSpace);
    return out;
  }

  /**
   * Returns a rectangle that defines the boundary of the display object, based
   * on the coordinate system defined by the `targetCoordinateSpace`
   * parameter, excluding any strokes on shapes. The values that the
   * `getRect()` method returns are the same or smaller than those
   * returned by the `getBounds()` method.
   *
   * Returns a rectangle.create()
   **/
  getRect(targetCoordinateSpace: DisplayObjectLike | null | undefined): RectangleLike {
    const out = rectangle.create();
    bounds.getRect(out, this.__data, targetCoordinateSpace);
    return out;
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   **/
  globalToLocal(pos: Readonly<Vector2Like>): Vector2Like {
    const out = vector2.create();
    transform.globalToLocal(out, this.__data, pos);
    return out;
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  hitTestObject(other: DisplayObjectLike): boolean {
    return hitTest.hitTestObject(this.__data, other);
  }

  /**
		Evaluates the display object to see if it overlaps or intersects with the
		point specified by the `x` and `y` parameters in world coordinates.

    @param shapeFlag Whether to check against the actual pixels of the object
						(`true`) or the bounding box
						(`false`).
	**/
  hitTestPoint(x: number, y: number, _shapeFlag: boolean = false): boolean {
    return hitTest.hitTestPoint(this.__data, x, y, _shapeFlag);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  invalidate(flags: DirtyFlags = DirtyFlags.Render): void {
    dirty.invalidate(this.__data, flags);
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   **/
  localToGlobal(point: Readonly<Vector2Like>): Vector2Like {
    const out = vector2.create();
    transform.localToGlobal(out, this.__data, point);
    return out;
  }

  toFunctionalObject(): DisplayObjectLike {
    return this.__data;
  }

  // Get & Set Methods

  get alpha(): number {
    return this.__data.alpha;
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this.__data.alpha) return;
    this.__data.alpha = value;
    dirty.invalidate(this.__data, DirtyFlags.Appearance);
  }

  get blendMode(): BlendMode {
    return this.__data.blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this.__data.blendMode) return;
    this.__data.blendMode = value;
    dirty.invalidate(this.__data, DirtyFlags.Appearance);
  }

  get cacheAsBitmap(): boolean {
    return this.__data.filters === null ? this.__data.cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this.__data.cacheAsBitmap) return;
    this.__data.cacheAsBitmap = value;
    dirty.invalidate(this.__data, DirtyFlags.CacheAsBitmap);
  }

  get cacheAsBitmapMatrix(): Matrix2DLike | null {
    return this.__data.cacheAsBitmapMatrix;
  }

  set cacheAsBitmapMatrix(value: Matrix2DLike | null) {
    const data = this.__data;
    if (matrix2D.equals(data.cacheAsBitmapMatrix, value)) return;

    if (value !== null) {
      if (data.cacheAsBitmapMatrix === null) {
        data.cacheAsBitmapMatrix = matrix2D.clone(value);
      } else {
        matrix2D.copy(data.cacheAsBitmapMatrix, value);
      }
    } else {
      data.cacheAsBitmapMatrix = null;
    }

    if (data.cacheAsBitmap) {
      dirty.invalidate(data, DirtyFlags.Transform);
    }
  }

  get filters(): BitmapFilterLike[] {
    const filters = this.__data.filters;
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: BitmapFilterLike[] | null) {
    if ((value === null || value.length == 0) && this.__data.filters === null) return;

    // if (value !== null) {
    //   target[$.filters] = value.map((filter) => {
    //     return filter.clone();
    //   });
    // } else {
    this.__data.filters = null;
    // }

    dirty.invalidate(this.__data, DirtyFlags.CacheAsBitmap);
  }

  get height(): number {
    return derived.getCurrentBounds(this.__data).height;
  }

  set height(value: number) {
    const localBounds = derived.getCurrentLocalBounds(this.__data);
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
    return this.__data.mask;
  }

  set mask(value: DisplayObjectLike | null) {
    if (value === this.__data.mask) return;

    // if (this.__data.mask !== null) {
    //   (this.__data.mask as DisplayObject)[$.maskedObject] = null;
    // }
    // if (value !== null) {
    //   value.__maskedObject = target;
    // }

    this.__data.mask = value;
    dirty.invalidate(this.__data, DirtyFlags.Clip);
  }

  get name(): string | null {
    return this.__data.name;
  }

  set name(value: string | null) {
    this.__data.name = value;
  }

  get opaqueBackground(): number | null {
    return this.__data.opaqueBackground;
  }

  set opaqueBackground(value: number | null) {
    if (value === this.__data.opaqueBackground) return;
    this.__data.opaqueBackground = value;
    dirty.invalidate(this.__data, DirtyFlags.Appearance);
  }

  get parent(): DisplayObjectContainerLike | null {
    return this.__data.parent;
  }

  private set parent(value: DisplayObjectContainerLike | null) {
    type ParentAccess = Omit<DisplayObject, 'parent'> & {
      parent: DisplayObjectContainerLike | null;
    };
    (this.__data as ParentAccess).parent = value;
  }

  get root(): DisplayObjectContainerLike | null {
    return this.__root;
  }

  private set root(value: DisplayObjectContainerLike | null) {
    this.__root = value;
  }

  get rotation(): number {
    return this.__data.rotation;
  }

  set rotation(value: number) {
    if (value === this.__data.rotation) return;
    // Normalize from -180 to 180
    value = value % 360.0;
    if (value > 180.0) {
      value -= 360.0;
    } else if (value < -180.0) {
      value += 360.0;
    }
    this.__data.rotation = value;
    dirty.invalidate(this.__data, DirtyFlags.Transform);
  }

  get scale9Grid(): RectangleLike | null {
    if (this.__data.scale9Grid === null) {
      return null;
    }
    return rectangle.clone(this.__data.scale9Grid);
  }

  set scale9Grid(value: RectangleLike | null) {
    const data = this.__data;
    if (value === null && data.scale9Grid === null) return;
    if (value !== null && data.scale9Grid !== null && rectangle.equals(data.scale9Grid, value)) return;

    if (value != null) {
      if (data.scale9Grid === null) data.scale9Grid = rectangle.create();
      rectangle.copy(data.scale9Grid, value);
    } else {
      data.scale9Grid = null;
    }

    dirty.invalidate(data, DirtyFlags.Appearance | DirtyFlags.Bounds | DirtyFlags.Clip | DirtyFlags.Transform);
  }

  get scaleX(): number {
    return this.__data.scaleX;
  }

  set scaleX(value: number) {
    if (value === this.__data.scaleX) return;
    this.__data.scaleX = value;
    dirty.invalidate(this.__data, DirtyFlags.Transform);
  }

  get scaleY(): number {
    return this.__data.scaleY;
  }

  set scaleY(value: number) {
    if (value === this.__data.scaleY) return;
    this.__data.scaleY = value;
    dirty.invalidate(this.__data, DirtyFlags.Transform);
  }

  get scrollRect(): RectangleLike | null {
    if (this.__data.scrollRect === null) {
      return null;
    }
    return rectangle.clone(this.__data.scrollRect);
  }

  set scrollRect(value: RectangleLike | null) {
    const data = this.__data;
    if (value === null && data.scrollRect === null) return;
    if (value !== null && data.scrollRect !== null && rectangle.equals(data.scrollRect, value)) return;

    if (value !== null) {
      if (data.scrollRect === null) data.scrollRect = rectangle.create();
      rectangle.copy(data.scrollRect, value);
    } else {
      data.scrollRect = null;
    }

    dirty.invalidate(data, DirtyFlags.Clip);
  }

  get shader(): Shader | null {
    return this.__data.shader;
  }

  set shader(value: Shader | null) {
    if (value === this.__data.shader) return;
    this.__data.shader = value;
    dirty.invalidate(this.__data, DirtyFlags.Appearance);
  }

  get stage(): StageLike | null {
    return this.__data.stage;
  }

  private set stage(value: StageLike | null) {
    type StageAccess = Omit<DisplayObject, 'stage'> & {
      stage: StageLike | null;
    };
    (this.__data as StageAccess).stage = value;
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
    return this.__data.visible;
  }

  set visible(value: boolean) {
    if (value === this.__data.visible) return;
    this.__data.visible = value;
    dirty.invalidate(this.__data, DirtyFlags.Appearance);
  }

  get width(): number {
    return derived.getCurrentBounds(this.__data).width;
  }

  set width(value: number) {
    const localBounds = derived.getCurrentLocalBounds(this.__data);
    if (localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / localBounds.width;
  }

  get x(): number {
    return this.__data.x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__data.x) return;
    this.__data.x = value;
    dirty.invalidate(this.__data, DirtyFlags.Transform);
  }

  get y(): number {
    return this.__data.y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__data.y) return;
    this.__data.y = value;
    dirty.invalidate(this.__data, DirtyFlags.Transform);
  }
}
