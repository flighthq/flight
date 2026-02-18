import { hitTestObject as __hitTestObject, hitTestPoint as __hitTestPoint } from '@flighthq/interaction';
import { matrix3x2, rectangle } from '@flighthq/math';
import {
  calculateBoundsRect,
  createDisplayObject,
  getBoundsRect,
  globalToLocal as __globalToLocal,
  invalidate as __invalidate,
  invalidateAppearance,
  invalidateLocalBounds,
  invalidateLocalTransform,
  invalidateWorldBounds,
  localToGlobal as __localToGlobal,
} from '@flighthq/stage';
import type {
  BitmapFilter as BitmapFilterLike,
  DisplayObject as DisplayObjectLike,
  DisplayObjectType,
  Matrix3x2 as Matrix3x2Like,
  PrimitiveData,
  Rectangle as RectangleLike,
  Shader,
  Stage as StageLike,
  Vector2 as Vector2Like,
} from '@flighthq/types';
import type { BlendMode } from '@flighthq/types';
import { GraphState } from '@flighthq/types';

import Rectangle from '../math/Rectangle.js';
import Vector2 from '../math/Vector2.js';
import type LoaderInfo from './LoaderInfo.js';
import Transform from './Transform.js';

export default class DisplayObject implements DisplayObjectLike {
  protected __loaderInfo: LoaderInfo | null = null;
  declare protected __model: DisplayObjectLike;
  protected __root: DisplayObjectLike | null = null;
  protected __transform: Transform | null = null;

  protected constructor() {
    this.__create();
  }

  protected __create(): void {
    this.__model = createDisplayObject();
  }

  /**
   * Returns a rectangle that defines the area of the display object relative
   * to the coordinate system of the `targetCoordinateSpace` object.
   *
   * Returns a new Rectangle()
   **/
  getBounds(targetCoordinateSpace: DisplayObjectLike | null): Rectangle {
    const out = new Rectangle();
    calculateBoundsRect(out, this.__model, targetCoordinateSpace);
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
    calculateBoundsRect(out, this.__model, targetCoordinateSpace);
    return out;
  }

  /**
   * Converts the `point` object from the Stage (global) coordinates
   * to the display object's (local) coordinates.
   **/
  globalToLocal(pos: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    __globalToLocal(out, this.__model, pos);
    return out;
  }

  /**
   * Evaluates the bounding box of the display object to see if it overlaps or
   * intersects with the bounding box of the `obj` display object.
   **/
  hitTestObject(other: DisplayObjectLike): boolean {
    return __hitTestObject(this.__model, other);
  }

  /**
		Evaluates the display object to see if it overlaps or intersects with the
		point specified by the `x` and `y` parameters in world coordinates.

    @param shapeFlag Whether to check against the actual pixels of the object
						(`true`) or the bounding box
						(`false`).
	**/
  hitTestPoint(x: number, y: number, _shapeFlag: boolean = false): boolean {
    return __hitTestPoint(this.__model, x, y, _shapeFlag);
  }

  /**
   * Calling `invalidate()` signals that the current object has changed and
   * should be redrawn the next time it is eligible to be rendered.
   */
  invalidate(): void {
    __invalidate(this.__model);
  }

  /**
   * Converts the `point` object from the display object's (local)
   * coordinates to world coordinates.
   **/
  localToGlobal(point: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    __localToGlobal(out, this.__model, point);
    return out;
  }

  // Get & Set Methods

  get alpha(): number {
    return this.__model.alpha;
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this.__model.alpha) return;
    this.__model.alpha = value;
    invalidateAppearance(this.__model);
  }

  get blendMode(): BlendMode {
    return this.__model.blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this.__model.blendMode) return;
    this.__model.blendMode = value;
    invalidateAppearance(this.__model);
  }

  get cacheAsBitmap(): boolean {
    return this.__model.filters === null ? this.__model.cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this.__model.cacheAsBitmap) return;
    this.__model.cacheAsBitmap = value;
    invalidateAppearance(this.__model);
  }

  get cacheAsBitmapMatrix(): Matrix3x2Like | null {
    return this.__model.cacheAsBitmapMatrix;
  }

  set cacheAsBitmapMatrix(value: Matrix3x2Like | null) {
    const data = this.__model;
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
      invalidateAppearance(this.__model);
    }
  }

  get children(): DisplayObjectLike[] | null {
    return this.__model.children;
  }

  protected set children(value: DisplayObjectLike[] | null) {
    type ChildrenAccess = Omit<DisplayObjectLike, 'children'> & {
      children: DisplayObjectLike[] | null;
    };
    (this.__model as ChildrenAccess).children = value;
  }

  get data(): PrimitiveData | null {
    return this.__model.data;
  }

  set data(value: PrimitiveData | null) {
    this.__model.data = value;
  }

  get filters(): BitmapFilterLike[] {
    const filters = this.__model.filters;
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: BitmapFilterLike[] | null) {
    if ((value === null || value.length == 0) && this.__model.filters === null) return;

    // if (value !== null) {
    //   target[$.filters] = value.map((filter) => {
    //     return filter.clone();
    //   });
    // } else {
    this.__model.filters = null;
    // }

    invalidateAppearance(this.__model);
  }

  get height(): number {
    return getBoundsRect(this.__model).height;
  }

  set height(value: number) {
    const localBounds = getBoundsRect(this.__model);
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
    return this.__model.mask;
  }

  set mask(value: DisplayObjectLike | null) {
    if (value === this.__model.mask) return;

    // if (this.__model.mask !== null) {
    //   (this.__model.mask as DisplayObject)[$.maskedObject] = null;
    // }
    // if (value !== null) {
    //   value.__maskedObject = target;
    // }

    this.__model.mask = value;
    invalidateAppearance(this.__model);
  }

  get name(): string | null {
    return this.__model.name;
  }

  set name(value: string | null) {
    this.__model.name = value;
  }

  get opaqueBackground(): number | null {
    return this.__model.opaqueBackground;
  }

  set opaqueBackground(value: number | null) {
    if (value === this.__model.opaqueBackground) return;
    this.__model.opaqueBackground = value;
    invalidateAppearance(this.__model);
  }

  get parent(): DisplayObjectLike | null {
    return this.__model.parent;
  }

  private set parent(value: DisplayObjectLike | null) {
    type ParentAccess = Omit<DisplayObjectLike, 'parent'> & {
      parent: DisplayObjectLike | null;
    };
    (this.__model as ParentAccess).parent = value;
  }

  get root(): DisplayObjectLike | null {
    return this.__root;
  }

  private set root(value: DisplayObjectLike | null) {
    this.__root = value;
  }

  get rotation(): number {
    return this.__model.rotation;
  }

  set rotation(value: number) {
    if (value === this.__model.rotation) return;
    // Normalize from -180 to 180
    value = value % 360.0;
    if (value > 180.0) {
      value -= 360.0;
    } else if (value < -180.0) {
      value += 360.0;
    }
    this.__model.rotation = value;
    invalidateLocalTransform(this.__model);
  }

  get scale9Grid(): RectangleLike | null {
    if (this.__model.scale9Grid === null) {
      return null;
    }
    return rectangle.clone(this.__model.scale9Grid);
  }

  set scale9Grid(value: RectangleLike | null) {
    const data = this.__model;
    if (value === null && data.scale9Grid === null) return;
    if (value !== null && data.scale9Grid !== null && rectangle.equals(data.scale9Grid, value)) return;

    if (value != null) {
      if (data.scale9Grid === null) data.scale9Grid = rectangle.create();
      rectangle.copy(data.scale9Grid, value);
    } else {
      data.scale9Grid = null;
    }

    invalidateAppearance(this.__model);
  }

  get scaleX(): number {
    return this.__model.scaleX;
  }

  set scaleX(value: number) {
    if (value === this.__model.scaleX) return;
    this.__model.scaleX = value;
    invalidateLocalTransform(this.__model);
  }

  get scaleY(): number {
    return this.__model.scaleY;
  }

  set scaleY(value: number) {
    if (value === this.__model.scaleY) return;
    this.__model.scaleY = value;
    invalidateLocalTransform(this.__model);
  }

  get scrollRect(): Rectangle | null {
    if (this.__model.scrollRect === null) {
      return null;
    }
    const out = new Rectangle();
    out.copyFrom(this.__model.scrollRect);
    return out;
  }

  set scrollRect(value: RectangleLike | null) {
    const data = this.__model;
    if (value === null && data.scrollRect === null) return;
    if (value !== null && data.scrollRect !== null && rectangle.equals(data.scrollRect, value)) return;

    if (value !== null) {
      if (data.scrollRect === null) data.scrollRect = rectangle.create();
      rectangle.copy(data.scrollRect, value);
    } else {
      data.scrollRect = null;
    }

    invalidateAppearance(this.__model);
  }

  get shader(): Shader | null {
    return this.__model.shader;
  }

  set shader(value: Shader | null) {
    if (value === this.__model.shader) return;
    this.__model.shader = value;
    invalidateAppearance(this.__model);
  }

  get stage(): StageLike | null {
    return this.__model.stage;
  }

  private set stage(value: StageLike | null) {
    type StageAccess = Omit<DisplayObjectLike, 'stage'> & {
      stage: StageLike | null;
    };
    (this.__model as StageAccess).stage = value;
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

  get type(): DisplayObjectType {
    return this.__model.type;
  }

  set type(value: DisplayObjectType) {
    this.__model.type = value;
  }

  get visible(): boolean {
    return this.__model.visible;
  }

  set visible(value: boolean) {
    if (value === this.__model.visible) return;
    this.__model.visible = value;
    invalidateAppearance(this.__model);
  }

  get width(): number {
    return getBoundsRect(this.__model).width;
  }

  set width(value: number) {
    const localBounds = getBoundsRect(this.__model);
    if (localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / localBounds.width;
  }

  get x(): number {
    return this.__model.x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__model.x) return;
    this.__model.x = value;
    invalidateLocalTransform(this.__model);
  }

  get y(): number {
    return this.__model.y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.__model.y) return;
    this.__model.y = value;
    invalidateLocalTransform(this.__model);
  }

  get [GraphState.SymbolKey](): GraphState | undefined {
    return this.__model[GraphState.SymbolKey];
  }

  set [GraphState.SymbolKey](value: GraphState) {
    this.__model[GraphState.SymbolKey] = value;
  }
}
