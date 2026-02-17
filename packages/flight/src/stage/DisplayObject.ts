import { matrix3x2, rectangle } from '@flighthq/math';
import { bounds, createDisplayObject, hitTest, revision, transform } from '@flighthq/stage';
import type {
  BitmapFilter as BitmapFilterLike,
  DisplayObject as DisplayObjectLike,
  LoaderInfo,
  Matrix3x2 as Matrix3x2Like,
  Rectangle as RectangleLike,
  Shader,
  Stage as StageLike,
  Vector2 as Vector2Like,
} from '@flighthq/types';
import type { BlendMode } from '@flighthq/types';
import { DisplayObjectState } from '@flighthq/types';

import Rectangle from '../math/Rectangle.js';
import Vector2 from '../math/Vector2.js';
import Transform from './Transform.js';

export default class DisplayObject implements DisplayObjectLike {
  protected __data: DisplayObjectLike;
  protected __loaderInfo: LoaderInfo | null = null;
  protected __root: DisplayObjectLike | null = null;
  protected __transform: Transform | null = null;

  protected constructor() {
    this.__data = createDisplayObject();
  }

  /**
   * Returns a rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object.
   *
   * Returns a new Rectangle()
   **/
  getBounds(targetCoordinateSpace: DisplayObjectLike | null): Rectangle {
    const out = new Rectangle();
    bounds.calculateBoundsRect(out, this.__data, targetCoordinateSpace);
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
  getRect(targetCoordinateSpace: DisplayObjectLike | null | undefined): Rectangle {
    const out = new Rectangle();
    bounds.calculateBoundsRect(out, this.__data, targetCoordinateSpace);
    return out;
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   **/
  globalToLocal(pos: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
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
  invalidate(): void {
    revision.invalidate(this.__data);
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   **/
  localToGlobal(point: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    transform.localToGlobal(out, this.__data, point);
    return out;
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
    revision.invalidateAppearance(this.__data);
  }

  get blendMode(): BlendMode {
    return this.__data.blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this.__data.blendMode) return;
    this.__data.blendMode = value;
    revision.invalidateAppearance(this.__data);
  }

  get cacheAsBitmap(): boolean {
    return this.__data.filters === null ? this.__data.cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this.__data.cacheAsBitmap) return;
    this.__data.cacheAsBitmap = value;
    revision.invalidateAppearance(this.__data);
  }

  get cacheAsBitmapMatrix(): Matrix3x2Like | null {
    return this.__data.cacheAsBitmapMatrix;
  }

  set cacheAsBitmapMatrix(value: Matrix3x2Like | null) {
    const data = this.__data;
    if (matrix3x2.equals(data.cacheAsBitmapMatrix, value)) return;

    if (value !== null) {
      if (data.cacheAsBitmapMatrix === null) {
        data.cacheAsBitmapMatrix = matrix3x2.clone(value);
      } else {
        matrix3x2.copy(data.cacheAsBitmapMatrix, value);
      }
    } else {
      data.cacheAsBitmapMatrix = null;
    }

    if (data.cacheAsBitmap) {
      revision.invalidateAppearance(this.__data);
    }
  }

  get children(): DisplayObjectLike[] | null {
    return this.__data.children;
  }

  protected set children(value: DisplayObjectLike[] | null) {
    type ChildrenAccess = Omit<DisplayObjectLike, 'children'> & {
      children: DisplayObjectLike[] | null;
    };
    (this.__data as ChildrenAccess).children = value;
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

    revision.invalidateAppearance(this.__data);
  }

  get height(): number {
    return bounds.getBoundsRect(this.__data).height;
  }

  set height(value: number) {
    const localBounds = bounds.getBoundsRect(this.__data);
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
    revision.invalidateAppearance(this.__data);
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
    revision.invalidateAppearance(this.__data);
  }

  get parent(): DisplayObjectLike | null {
    return this.__data.parent;
  }

  private set parent(value: DisplayObjectLike | null) {
    type ParentAccess = Omit<DisplayObjectLike, 'parent'> & {
      parent: DisplayObjectLike | null;
    };
    (this.__data as ParentAccess).parent = value;
  }

  get root(): DisplayObjectLike | null {
    return this.__root;
  }

  private set root(value: DisplayObjectLike | null) {
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
    revision.invalidateLocalTransform(this.__data);
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

    revision.invalidateAppearance(this.__data);
  }

  get scaleX(): number {
    return this.__data.scaleX;
  }

  set scaleX(value: number) {
    if (value === this.__data.scaleX) return;
    this.__data.scaleX = value;
    revision.invalidateLocalTransform(this.__data);
  }

  get scaleY(): number {
    return this.__data.scaleY;
  }

  set scaleY(value: number) {
    if (value === this.__data.scaleY) return;
    this.__data.scaleY = value;
    revision.invalidateLocalTransform(this.__data);
  }

  get scrollRect(): Rectangle | null {
    if (this.__data.scrollRect === null) {
      return null;
    }
    const out = new Rectangle();
    out.copyFrom(this.__data.scrollRect);
    return out;
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

    revision.invalidateAppearance(this.__data);
  }

  get shader(): Shader | null {
    return this.__data.shader;
  }

  set shader(value: Shader | null) {
    if (value === this.__data.shader) return;
    this.__data.shader = value;
    revision.invalidateAppearance(this.__data);
  }

  get stage(): StageLike | null {
    return this.__data.stage;
  }

  private set stage(value: StageLike | null) {
    type StageAccess = Omit<DisplayObjectLike, 'stage'> & {
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

    // if (value.__hasMatrix3x2)
    // {
    //     var other = value.__displayObject.__transform;
    //     __objectTransform.__setTransform(other.a, other.b, other.c, other.d, other.tx, other.ty);
    // }
    // else
    // {
    //     __objectTransform.__hasMatrix3x2 = false;
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
    revision.invalidateAppearance(this.__data);
  }

  get width(): number {
    return bounds.getBoundsRect(this.__data).width;
  }

  set width(value: number) {
    const localBounds = bounds.getBoundsRect(this.__data);
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
    revision.invalidateLocalTransform(this.__data);
  }

  get y(): number {
    return this.__data.y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__data.y) return;
    this.__data.y = value;
    revision.invalidateLocalTransform(this.__data);
  }

  get [DisplayObjectState.SymbolKey](): DisplayObjectState | undefined {
    return this.__data[DisplayObjectState.SymbolKey];
  }

  set [DisplayObjectState.SymbolKey](value: DisplayObjectState) {
    this.__data[DisplayObjectState.SymbolKey] = value;
  }
}
