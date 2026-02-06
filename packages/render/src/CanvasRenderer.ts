import type { Renderable } from '@flighthq/contracts';
import { RenderableSymbols as R } from '@flighthq/contracts';
import { Matrix3 as Matrix3Impl } from '@flighthq/math';
import type { Matrix3, Rectangle } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import CanvasRenderData from './CanvasRenderData';
import type { CanvasRendererOptions } from './CanvasRendererOptions';

export default class CanvasRenderer {
  protected static __currentBlendMode: BlendMode | null = null;
  protected static __renderableStack: Renderable[] = [];
  protected static __overrideBlendMode: BlendMode | null = null;

  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;

  pixelRatio: number;
  renderTransform: Matrix3;
  roundPixels: boolean;

  protected __backgroundColor: number = 0x00000000;
  protected __backgroundColorSplit: number[] = [0, 0, 0, 0];
  protected __backgroundColorString: string = '#00000000';
  protected __renderData: WeakMap<Renderable, CanvasRenderData> = new WeakMap();
  protected __renderQueue: CanvasRenderData[] = [];
  protected __renderQueueLength: number = 0;

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;

    const context = canvas.getContext('2d', options?.contextAttributes || undefined);
    if (!context) throw new Error('Failed to get context for canvas.');
    this.context = context;
    this.context.imageSmoothingEnabled = options?.imageSmoothingEnabled ?? true;
    this.context.imageSmoothingQuality = options?.imageSmoothingQuality ?? 'high';

    this.contextAttributes = this.context.getContextAttributes();

    this.backgroundColor = options?.backgroundColor ?? 0x00000000;
    this.pixelRatio = options?.pixelRatio ?? window.devicePixelRatio | 1;
    this.renderTransform = options?.renderTransform ?? new Matrix3Impl();
    this.roundPixels = options?.roundPixels ?? false;
  }

  static render(target: CanvasRenderer, source: Renderable): void {
    const dirty = this.__updateRenderQueue(target, source);
    if (dirty) {
      this.__clear(target);
      this.__flushRenderQueue(target);
    }
  }

  protected static __clear(target: CanvasRenderer): void {
    // const cacheBlendMode = source[R.blendMode];
    this.__currentBlendMode = null;
    this.__setBlendMode(target, BlendMode.Normal);

    target.context.setTransform(1, 0, 0, 1, 0, 0);
    target.context.globalAlpha = 1;

    if ((target.__backgroundColor & 0xff) !== 0) {
      target.context.fillStyle = target.__backgroundColorString;
      target.context.fillRect(0, 0, target.canvas.width, target.canvas.height);
    } else {
      target.context.clearRect(0, 0, target.canvas.width, target.canvas.height);
    }

    // this.__setBlendMode(target, cacheBlendMode);
  }

  protected static __flushRenderQueue(target: CanvasRenderer): void {
    // const renderQueue = target.__renderQueue;
    const renderQueueLength = target.__renderQueueLength;

    for (let i = 0; i < renderQueueLength; i++) {
      // const renderData = renderQueue[i];
      // switch (renderData.type) {
      //   case BITMAP_DATA:
      //     CanvasBitmapData.renderDrawable(cast object, this);
      //     break;
      //   case STAGE, SPRITE:
      //     CanvasDisplayObjectContainer.renderDrawable(cast object, this);
      //     break;
      //   case BITMAP:
      //     CanvasBitmap.renderDrawable(cast object, this);
      //     break;
      //   case SHAPE:
      //     CanvasDisplayObject.renderDrawable(cast object, this);
      //     break;
      //   case SIMPLE_BUTTON:
      //     CanvasSimpleButton.renderDrawable(cast object, this);
      //     break;
      //   case TEXT_FIELD:
      //     CanvasTextField.renderDrawable(cast object, this);
      //     break;
      //   case VIDEO:
      //     CanvasVideo.renderDrawable(cast object, this);
      //     break;
      //   case TILEMAP:
      //     CanvasTilemap.renderDrawable(cast object, this);
      //     break;
      //   default:
      // }
    }
  }

  protected static __popMask(target: CanvasRenderer): void {
    target.context.restore();
  }

  protected static __popClipRect(target: CanvasRenderer): void {
    target.context.restore();
  }

  protected static __popMaskObject(
    target: CanvasRenderer,
    object: CanvasRenderData,
    handleScrollRect: boolean = true,
  ): void {
    if (/*!object.__isCacheBitmapRender && */ object.source[R.mask] !== null) {
      this.__popMask(target);
    }

    if (handleScrollRect && object.source[R.scrollRect] != null) {
      this.__popClipRect(target);
    }
  }

  protected static __pushClipRect(target: CanvasRenderer, rect: Rectangle, transform: Matrix3): void {
    target.context.save();

    this.__setTransform(target, target.context, transform);

    target.context.beginPath();
    target.context.rect(rect.x, rect.y, rect.width, rect.height);
    target.context.clip();
  }

  protected static __pushMask(target: CanvasRenderer, mask: CanvasRenderData): void {
    target.context.save();

    this.__setTransform(target, target.context, mask.renderTransform);

    target.context.beginPath();
    // this.__renderDrawableMask(target, mask);
    target.context.closePath();

    target.context.clip();
  }

  protected static __pushMaskObject(
    target: CanvasRenderer,
    object: CanvasRenderData,
    handleScrollRect: boolean = true,
  ): void {
    if (handleScrollRect && object.source[R.scrollRect] !== null) {
      this.__pushClipRect(target, object.source[R.scrollRect]!, object.renderTransform);
    }
    if (/*!object.__isCacheBitmapRender &&*/ object.mask !== null) {
      this.__pushMask(target, object.mask);
    }
  }

  protected static __setBlendMode(target: CanvasRenderer, value: BlendMode): void {
    if (this.__overrideBlendMode !== null) value = this.__overrideBlendMode;
    if (value === this.__currentBlendMode) return;

    this.__currentBlendMode = value;
    const context = target.context;

    switch (value) {
      case BlendMode.Add:
        context.globalCompositeOperation = 'lighter';
        break;
      // case BlendMode.Alpha:
      // 	context.globalCompositeOperation = "";
      case BlendMode.Darken:
        context.globalCompositeOperation = 'darken';
        break;
      case BlendMode.Difference:
        context.globalCompositeOperation = 'difference';
        break;
      // case ERASE:
      //   context.globalCompositeOperation = "";
      case BlendMode.Hardlight:
        context.globalCompositeOperation = 'hard-light';
        break;
      // case INVERT:
      //   context.globalCompositeOperation = "";
      // case LAYER:
      // 	context.globalCompositeOperation = "source-over";
      case BlendMode.Lighten:
        context.globalCompositeOperation = 'lighten';
        break;
      case BlendMode.Multiply:
        context.globalCompositeOperation = 'multiply';
        break;
      case BlendMode.Overlay:
        context.globalCompositeOperation = 'overlay';
        break;
      case BlendMode.Screen:
        context.globalCompositeOperation = 'screen';
        break;
      // case SHADER:
      //   context.globalCompositeOperation = "";
      // case SUBTRACT:
      //   context.globalCompositeOperation = "";
      default:
        context.globalCompositeOperation = 'source-over';
        break;
    }
  }

  protected static __setTransform(target: CanvasRenderer, context: CanvasRenderingContext2D, transform: Matrix3): void {
    if (target.roundPixels) {
      context.setTransform(
        transform.m[0], // a
        transform.m[1], // b
        transform.m[3], // c
        transform.m[4], // d
        Math.fround(transform.m[2]), // tx
        Math.fround(transform.m[5]), // ty
      );
    } else {
      context.setTransform(
        transform.m[0], // a
        transform.m[1], // b
        transform.m[3], // c
        transform.m[4], // d
        transform.m[2], // tx
        transform.m[5], // ty
      );
    }
  }

  protected static __updateRenderQueue(target: CanvasRenderer, source: Renderable): boolean {
    const renderableStack = this.__renderableStack;
    const renderDataMap = target.__renderData;
    const renderQueue = target.__renderQueue;

    let dirty = false;
    let parentAlpha = 1;
    let renderQueueIndex = 0;

    let renderableStackLength = 1;
    renderableStack[0] = source;

    while (renderableStackLength > 0) {
      const current = renderableStack[--renderableStackLength];
      const renderData =
        renderDataMap.get(current) ?? renderDataMap.set(current, new CanvasRenderData(current)).get(current)!;

      if (!dirty) dirty = renderData.isDirty();
      if (!current[R.visible]) continue;

      const mask = current[R.mask];
      if (mask !== null) {
        const maskRenderData =
          renderDataMap.get(mask) ?? renderDataMap.set(mask, new CanvasRenderData(mask)).get(mask)!;
        if (!dirty) dirty = maskRenderData.isDirty();
        renderData.mask = maskRenderData;
      }

      const renderAlpha = current[R.alpha] * parentAlpha;
      renderData.renderAlpha = renderAlpha;
      renderData.renderTransform = source[R.worldTransform];

      renderQueue[renderQueueIndex++] = renderData;

      const children = current[R.children];

      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          // Add child to stack for further traversal
          renderableStack[renderableStackLength++] = children[i];
        }
      }

      parentAlpha = renderAlpha;
    }

    target.__renderQueueLength = renderQueueIndex;
    return dirty;
  }

  // Get & Set Methods

  get backgroundColor(): number {
    return this.__backgroundColor;
  }

  set backgroundColor(value: number) {
    if (value === this.__backgroundColor) return;
    this.__backgroundColor = value & 0xffffffff;
    const r = (value & 0xff000000) >>> 24;
    const g = (value & 0x00ff0000) >>> 16;
    const b = (value & 0x0000ff00) >>> 8;
    const a = value & 0xff;
    this.__backgroundColorSplit[0] = r / 0xff;
    this.__backgroundColorSplit[1] = g / 0xff;
    this.__backgroundColorSplit[2] = b / 0xff;
    this.__backgroundColorSplit[3] = a / 0xff;
    this.__backgroundColorString = '#' + (value & 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
  }

  get imageSmoothingEnabled(): boolean {
    return this.context?.imageSmoothingEnabled ?? false;
  }

  set imageSmoothingEnabled(value: boolean) {
    if (this.context !== null) this.context.imageSmoothingEnabled = value;
  }

  get imageSmoothingQuality(): ImageSmoothingQuality {
    return this.context?.imageSmoothingQuality ?? 'high';
  }

  set imageSmoothingQuality(value: ImageSmoothingQuality) {
    if (this.context !== null) this.context.imageSmoothingQuality = value;
  }
}
