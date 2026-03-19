import { matrix3x2, rectangle } from '@flighthq/geometry';
import { hitTestObject as __hitTestObject, hitTestPoint as __hitTestPoint } from '@flighthq/interaction';
import {
  calculateBoundsRect,
  getBoundsRect,
  getParent,
  globalToLocal2D,
  invalidate as __invalidate,
  invalidateAppearance,
  invalidateLocalTransform,
  localToGlobal2D,
} from '@flighthq/scene-graph-core';
import { createDisplayObject, getDisplayObjectRuntime } from '@flighthq/scene-graph-display';
import type { BlendMode } from '@flighthq/types';
import { type DisplayObject as DisplayObjectType, type Filter, type Shader, StageKind } from '@flighthq/types';

import Matrix from '../../../geometry/Matrix.js';
import Rectangle from '../../../geometry/Rectangle.js';
import Vector2 from '../../../geometry/Vector2.js';
import { getDisplayObjectFromType, registerDisplayObject } from './internal/displayObjectMap.js';
import type { DisplayObjectInternal } from './internal/writeInternal.js';
import type LoaderInfo from './LoaderInfo.js';
import type Stage from './Stage.js';
import Transform from './Transform.js';

export default class DisplayObject {
  declare public readonly value: DisplayObjectType;

  protected __loaderInfo: LoaderInfo | null = null;
  protected __root: DisplayObject | null = null;
  protected __transform: Transform | null = null;

  protected constructor() {
    this.__create();
    registerDisplayObject(this);
  }

  protected __create(): void {
    (this as DisplayObjectInternal).value = createDisplayObject();
  }

  getBounds(targetCoordinateSpace: DisplayObject | null): Rectangle {
    const out = new Rectangle();
    calculateBoundsRect(out.value, this.value, targetCoordinateSpace?.value);
    return out;
  }

  getRect(targetCoordinateSpace: DisplayObject | null | undefined): Rectangle {
    const out = new Rectangle();
    calculateBoundsRect(out.value, this.value, targetCoordinateSpace?.value);
    return out;
  }

  globalToLocal(pos: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    globalToLocal2D(out.value, this.value, pos.value);
    return out;
  }

  hitTestObject(other: DisplayObject): boolean {
    return __hitTestObject(this.value, other.value);
  }

  hitTestPoint(x: number, y: number, _shapeFlag: boolean = false): boolean {
    return __hitTestPoint(this.value, x, y, _shapeFlag);
  }

  invalidate(): void {
    __invalidate(this.value);
  }

  localToGlobal(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    localToGlobal2D(out.value, this.value, point.value);
    return out;
  }

  // Get & Set Methods

  get alpha(): number {
    return this.value.alpha;
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this.value.alpha) return;
    this.value.alpha = value;
    invalidateAppearance(this.value);
  }

  get blendMode(): BlendMode {
    return this.value.blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this.value.blendMode) return;
    this.value.blendMode = value;
    invalidateAppearance(this.value);
  }

  get cacheAsBitmap(): boolean {
    return this.value.filters === null ? this.value.cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this.value.cacheAsBitmap) return;
    this.value.cacheAsBitmap = value;
    invalidateAppearance(this.value);
  }

  get cacheAsBitmapMatrix(): Matrix | null {
    if (this.value.cacheAsBitmapMatrix === null) return null;
    return Matrix.fromType(this.value.cacheAsBitmapMatrix);
  }

  set cacheAsBitmapMatrix(value: Matrix | null) {
    if (value !== null) {
      if (this.value.cacheAsBitmapMatrix !== null) {
        if (matrix3x2.equals(this.value.cacheAsBitmapMatrix, value.value)) return;
        matrix3x2.copy(this.value.cacheAsBitmapMatrix, value.value);
      } else {
        this.value.cacheAsBitmapMatrix = matrix3x2.clone(value.value);
      }
    } else {
      if (this.value.cacheAsBitmapMatrix === null) return;
      this.value.cacheAsBitmapMatrix = null;
    }
    if (this.value.cacheAsBitmap) {
      invalidateAppearance(this.value);
    }
  }

  get filters(): Filter[] {
    const filters = this.value.filters;
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: Filter[] | null) {
    if ((value === null || value.length == 0) && this.value.filters === null) return;

    // if (value !== null) {
    //   target[$.filters] = value.map((filter) => {
    //     return filter.clone();
    //   });
    // } else {
    this.value.filters = null;
    // }

    invalidateAppearance(this.value);
  }

  get height(): number {
    return getBoundsRect(this.value).height;
  }

  set height(value: number) {
    const localBounds = getBoundsRect(this.value);
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

  get mask(): DisplayObject | null {
    if (this.value.mask !== null) {
      return getDisplayObjectFromType(this.value.mask);
    }
    return null;
  }

  set mask(value: DisplayObject | null) {
    if (value !== null) {
      if (this.value.mask === value.value) return;
      this.value.mask = value.value;
    } else {
      if (this.value.mask === null) return;
      this.value.mask = null;
    }
    invalidateAppearance(this.value);
  }

  get name(): string | null {
    return this.value.name;
  }

  set name(value: string | null) {
    this.value.name = value;
  }

  get opaqueBackground(): number | null {
    return this.value.opaqueBackground;
  }

  set opaqueBackground(value: number | null) {
    if (value === this.value.opaqueBackground) return;
    this.value.opaqueBackground = value;
    invalidateAppearance(this.value);
  }

  get parent(): DisplayObject | null {
    return getDisplayObjectFromType(getParent(this.value) as DisplayObjectType);
  }

  get root(): DisplayObject | null {
    return this.__root;
  }

  private set root(value: DisplayObject | null) {
    this.__root = value;
  }

  get rotation(): number {
    return this.value.rotation;
  }

  set rotation(value: number) {
    if (value === this.value.rotation) return;
    // Normalize from -180 to 180
    value = value % 360.0;
    if (value > 180.0) {
      value -= 360.0;
    } else if (value < -180.0) {
      value += 360.0;
    }
    this.value.rotation = value;
    invalidateLocalTransform(this.value);
  }

  get scale9Grid(): Rectangle | null {
    if (this.value.scale9Grid === null) {
      return null;
    }
    return Rectangle.fromType(this.value.scale9Grid);
  }

  set scale9Grid(value: Rectangle | null) {
    const data = this.value;
    if (value === null && data.scale9Grid === null) return;
    if (value !== null && data.scale9Grid !== null && rectangle.equals(data.scale9Grid, value)) return;

    if (value != null) {
      if (data.scale9Grid === null) data.scale9Grid = rectangle.create();
      rectangle.copy(data.scale9Grid, value);
    } else {
      data.scale9Grid = null;
    }

    invalidateAppearance(this.value);
  }

  get scaleX(): number {
    return this.value.scaleX;
  }

  set scaleX(value: number) {
    if (value === this.value.scaleX) return;
    this.value.scaleX = value;
    invalidateLocalTransform(this.value);
  }

  get scaleY(): number {
    return this.value.scaleY;
  }

  set scaleY(value: number) {
    if (value === this.value.scaleY) return;
    this.value.scaleY = value;
    invalidateLocalTransform(this.value);
  }

  get scrollRect(): Rectangle | null {
    if (this.value.scrollRect === null) {
      return null;
    }
    return Rectangle.fromType(this.value.scrollRect);
  }

  set scrollRect(value: Rectangle | null) {
    const data = this.value;
    if (value === null && data.scrollRect === null) return;
    if (value !== null && data.scrollRect !== null && rectangle.equals(data.scrollRect, value)) return;

    if (value !== null) {
      if (data.scrollRect === null) data.scrollRect = rectangle.create();
      rectangle.copy(data.scrollRect, value);
    } else {
      data.scrollRect = null;
    }

    invalidateAppearance(this.value);
  }

  get shader(): Shader | null {
    return this.value.shader;
  }

  set shader(value: Shader | null) {
    if (value === this.value.shader) return;
    this.value.shader = value;
    invalidateAppearance(this.value);
  }

  get stage(): Stage | null {
    let current = getDisplayObjectRuntime(this.value).parent;
    while (current !== null) {
      if (current.kind === StageKind) return getDisplayObjectFromType(current as DisplayObjectType) as Stage;
      current = getDisplayObjectRuntime(current as DisplayObjectType).parent;
    }
    return null;
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
    return this.value.visible;
  }

  set visible(value: boolean) {
    if (value === this.value.visible) return;
    this.value.visible = value;
    invalidateAppearance(this.value);
  }

  get width(): number {
    return getBoundsRect(this.value).width;
  }

  set width(value: number) {
    const localBounds = getBoundsRect(this.value);
    if (localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / localBounds.width;
  }

  get x(): number {
    return this.value.x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.value.x) return;
    this.value.x = value;
    invalidateLocalTransform(this.value);
  }

  get y(): number {
    return this.value.y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this.value.y) return;
    this.value.y = value;
    invalidateLocalTransform(this.value);
  }
}
