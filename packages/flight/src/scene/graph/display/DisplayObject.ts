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
import { type DisplayObject as DisplayObjectModel, type Filter, type Shader, StageKind } from '@flighthq/types';

import Matrix from '../../../geometry/Matrix.js';
import Rectangle from '../../../geometry/Rectangle.js';
import Vector2 from '../../../geometry/Vector2.js';
import { getDisplayObjectFromModel, registerDisplayObject } from './internal/displayObjectMap.js';
import type LoaderInfo from './LoaderInfo.js';
import type Stage from './Stage.js';
import Transform from './Transform.js';

export default class DisplayObject {
  declare protected _model: DisplayObjectModel;

  protected __loaderInfo: LoaderInfo | null = null;
  protected __root: DisplayObject | null = null;
  protected __transform: Transform | null = null;

  protected constructor() {
    this.__create();
    registerDisplayObject(this);
  }

  protected __create(): void {
    this._model = createDisplayObject();
  }

  getBounds(targetCoordinateSpace: DisplayObject | null): Rectangle {
    const out = new Rectangle();
    calculateBoundsRect(out.model, this._model, targetCoordinateSpace?.model);
    return out;
  }

  getRect(targetCoordinateSpace: DisplayObject | null | undefined): Rectangle {
    const out = new Rectangle();
    calculateBoundsRect(out.model, this._model, targetCoordinateSpace?.model);
    return out;
  }

  globalToLocal(pos: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    globalToLocal2D(out.model, this._model, pos.model);
    return out;
  }

  hitTestObject(other: DisplayObject): boolean {
    return __hitTestObject(this._model, other.model);
  }

  hitTestPoint(x: number, y: number, _shapeFlag: boolean = false): boolean {
    return __hitTestPoint(this._model, x, y, _shapeFlag);
  }

  invalidate(): void {
    __invalidate(this._model);
  }

  localToGlobal(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    localToGlobal2D(out.model, this._model, point.model);
    return out;
  }

  // Get & Set Methods

  get alpha(): number {
    return this._model.alpha;
  }

  set alpha(value: number) {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;
    if (value === this._model.alpha) return;
    this._model.alpha = value;
    invalidateAppearance(this._model);
  }

  get blendMode(): BlendMode {
    return this._model.blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this._model.blendMode) return;
    this._model.blendMode = value;
    invalidateAppearance(this._model);
  }

  get cacheAsBitmap(): boolean {
    return this._model.filters === null ? this._model.cacheAsBitmap : true;
  }

  set cacheAsBitmap(value: boolean) {
    if (value === this._model.cacheAsBitmap) return;
    this._model.cacheAsBitmap = value;
    invalidateAppearance(this._model);
  }

  get cacheAsBitmapMatrix(): Matrix | null {
    if (this._model.cacheAsBitmapMatrix === null) return null;
    return Matrix.fromModel(this._model.cacheAsBitmapMatrix);
  }

  set cacheAsBitmapMatrix(value: Matrix | null) {
    if (value !== null) {
      if (this._model.cacheAsBitmapMatrix !== null) {
        if (matrix3x2.equals(this._model.cacheAsBitmapMatrix, value.model)) return;
        matrix3x2.copy(this._model.cacheAsBitmapMatrix, value.model);
      } else {
        this._model.cacheAsBitmapMatrix = matrix3x2.clone(value.model);
      }
    } else {
      if (this._model.cacheAsBitmapMatrix === null) return;
      this._model.cacheAsBitmapMatrix = null;
    }
    if (this._model.cacheAsBitmap) {
      invalidateAppearance(this._model);
    }
  }

  get filters(): Filter[] {
    const filters = this._model.filters;
    if (filters === null) {
      return [];
    } else {
      return filters.slice();
    }
  }

  set filters(value: Filter[] | null) {
    if ((value === null || value.length == 0) && this._model.filters === null) return;

    // if (value !== null) {
    //   target[$.filters] = value.map((filter) => {
    //     return filter.clone();
    //   });
    // } else {
    this._model.filters = null;
    // }

    invalidateAppearance(this._model);
  }

  get height(): number {
    return getBoundsRect(this._model).height;
  }

  set height(value: number) {
    const localBounds = getBoundsRect(this._model);
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
    if (this._model.mask !== null) {
      return getDisplayObjectFromModel(this._model.mask);
    }
    return null;
  }

  set mask(value: DisplayObject | null) {
    if (value !== null) {
      if (this._model.mask === value.model) return;
      this._model.mask = value.model;
    } else {
      if (this._model.mask === null) return;
      this._model.mask = null;
    }
    invalidateAppearance(this._model);
  }

  get model(): DisplayObjectModel {
    return this._model;
  }

  get name(): string | null {
    return this._model.name;
  }

  set name(value: string | null) {
    this._model.name = value;
  }

  get opaqueBackground(): number | null {
    return this._model.opaqueBackground;
  }

  set opaqueBackground(value: number | null) {
    if (value === this._model.opaqueBackground) return;
    this._model.opaqueBackground = value;
    invalidateAppearance(this._model);
  }

  get parent(): DisplayObject | null {
    return getDisplayObjectFromModel(getParent(this._model) as DisplayObjectModel);
  }

  get root(): DisplayObject | null {
    return this.__root;
  }

  private set root(value: DisplayObject | null) {
    this.__root = value;
  }

  get rotation(): number {
    return this._model.rotation;
  }

  set rotation(value: number) {
    if (value === this._model.rotation) return;
    // Normalize from -180 to 180
    value = value % 360.0;
    if (value > 180.0) {
      value -= 360.0;
    } else if (value < -180.0) {
      value += 360.0;
    }
    this._model.rotation = value;
    invalidateLocalTransform(this._model);
  }

  get scale9Grid(): Rectangle | null {
    if (this._model.scale9Grid === null) {
      return null;
    }
    return Rectangle.fromModel(this._model.scale9Grid);
  }

  set scale9Grid(value: Rectangle | null) {
    const data = this._model;
    if (value === null && data.scale9Grid === null) return;
    if (value !== null && data.scale9Grid !== null && rectangle.equals(data.scale9Grid, value)) return;

    if (value != null) {
      if (data.scale9Grid === null) data.scale9Grid = rectangle.create();
      rectangle.copy(data.scale9Grid, value);
    } else {
      data.scale9Grid = null;
    }

    invalidateAppearance(this._model);
  }

  get scaleX(): number {
    return this._model.scaleX;
  }

  set scaleX(value: number) {
    if (value === this._model.scaleX) return;
    this._model.scaleX = value;
    invalidateLocalTransform(this._model);
  }

  get scaleY(): number {
    return this._model.scaleY;
  }

  set scaleY(value: number) {
    if (value === this._model.scaleY) return;
    this._model.scaleY = value;
    invalidateLocalTransform(this._model);
  }

  get scrollRect(): Rectangle | null {
    if (this._model.scrollRect === null) {
      return null;
    }
    return Rectangle.fromModel(this._model.scrollRect);
  }

  set scrollRect(value: Rectangle | null) {
    const data = this._model;
    if (value === null && data.scrollRect === null) return;
    if (value !== null && data.scrollRect !== null && rectangle.equals(data.scrollRect, value)) return;

    if (value !== null) {
      if (data.scrollRect === null) data.scrollRect = rectangle.create();
      rectangle.copy(data.scrollRect, value);
    } else {
      data.scrollRect = null;
    }

    invalidateAppearance(this._model);
  }

  get shader(): Shader | null {
    return this._model.shader;
  }

  set shader(value: Shader | null) {
    if (value === this._model.shader) return;
    this._model.shader = value;
    invalidateAppearance(this._model);
  }

  get stage(): Stage | null {
    let current = getDisplayObjectRuntime(this._model).parent;
    while (current !== null) {
      if (current.kind === StageKind) return getDisplayObjectFromModel(current as DisplayObjectModel) as Stage;
      current = getDisplayObjectRuntime(current as DisplayObjectModel).parent;
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
    return this._model.visible;
  }

  set visible(value: boolean) {
    if (value === this._model.visible) return;
    this._model.visible = value;
    invalidateAppearance(this._model);
  }

  get width(): number {
    return getBoundsRect(this._model).width;
  }

  set width(value: number) {
    const localBounds = getBoundsRect(this._model);
    if (localBounds.width === 0) return;
    // Invalidation (if necessary) occurs in scaleX setter
    this.scaleX = value / localBounds.width;
  }

  get x(): number {
    return this._model.x;
  }

  set x(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this._model.x) return;
    this._model.x = value;
    invalidateLocalTransform(this._model);
  }

  get y(): number {
    return this._model.y;
  }

  set y(value: number) {
    if (value !== value) value = 0; // convert NaN to 0
    if (value === this._model.y) return;
    this._model.y = value;
    invalidateLocalTransform(this._model);
  }
}
