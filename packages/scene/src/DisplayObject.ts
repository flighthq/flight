import { Rectangle } from '@flighthq/core';
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
  protected __alpha: number = 1.0;
  protected __blendMode: BlendMode = BlendMode.Normal;
  protected __cacheAsBitmap: boolean = false;
  protected __cacheAsBitmapMatrix: Matrix | null = null;
  protected __filters: BitmapFilter[] | null = null;
  protected __dirtyFlags: DirtyFlags = DirtyFlags.None;
  protected __height: number = 0;
  protected __loaderInfo: LoaderInfo | null = null;
  protected __localBounds: Rectangle = new Rectangle();
  protected __localTransform: Matrix = new Matrix();
  protected __mask: DisplayObject | null = null;
  protected __maskedObject: DisplayObject | null = null;
  protected __name: string | null = null;
  protected __opaqueBackground: number | null = null;
  protected __parent: DisplayObject | null = null;
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
  protected __visible: boolean = true;
  protected __x: number = 0;
  protected __y: number = 0;

  constructor() {}

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
    }

    if ((flags & DirtyFlags.Bounds) !== 0) {
      // Changing local bounds also requires transformed bounds update
      target.__dirtyFlags |= DirtyFlags.TransformedBounds;
    }
  }

  private static __updateLocalBounds(target: DisplayObject): void {
    if ((target.__dirtyFlags & DirtyFlags.Bounds) === 0) return;

    // TODO, update __localBounds

    Matrix.transformRect(target.__localTransform, target.__transformedBounds, target.__transformedBounds);

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

    Matrix.transformRect(target.__localTransform, target.__transformedBounds, target.__transformedBounds);

    target.__dirtyFlags &= ~DirtyFlags.TransformedBounds;
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
    if (Matrix.equals(value, this.__cacheAsBitmapMatrix)) return;

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
