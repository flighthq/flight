import { prepareRenderQueue, updateRenderableDataTree } from '@flighthq/render-core';
import type { CanvasRendererState, Matrix3x2, Rectangle, Renderable, RenderableData } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function renderCanvas(state: CanvasRendererState, source: Renderable): void {
  const dirty = updateRenderableDataTree(state, source);
  if (dirty) {
    prepareRenderQueue(state, source);
    clear(state);
    flushRenderQueue(state);
  }
}

export function clear(state: CanvasRendererState): void {
  const cacheBlendMode = state.currentBlendMode;
  state.currentBlendMode = null;
  setBlendMode(state, BlendMode.Normal);

  state.context.setTransform(1, 0, 0, 1, 0, 0);
  state.context.globalAlpha = 1;

  if ((state.backgroundColor & 0xff) !== 0) {
    state.context.fillStyle = state.backgroundColorString;
    state.context.fillRect(0, 0, state.canvas.width, state.canvas.height);
  } else {
    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }

  setBlendMode(state, cacheBlendMode);
}

export function flushRenderQueue(state: CanvasRendererState): void {
  // const renderQueue = state.renderQueue;
  const renderQueueLength = state.currentQueueLength;

  for (let i = 0; i < renderQueueLength; i++) {
    // const data = renderQueue[i];
    // switch (data.type) {
    //   case BITMAP_DATA:
    //     CanvasBitmapData.renderDrawable(cast object, this);
    //     break;
    //   case STAGE, SPRITE:
    //     CanvasDisplayObject.renderDrawable(cast object, this);
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

export function popMask(state: CanvasRendererState): void {
  state.context.restore();
}

export function popClipRect(state: CanvasRendererState): void {
  state.context.restore();
}

export function popMaskObject(
  state: CanvasRendererState,
  object: RenderableData,
  handleScrollRect: boolean = true,
): void {
  if (/*!object.__isCacheBitmapRender && */ object.source.mask !== null) {
    popMask(state);
  }

  if (handleScrollRect && object.source.scrollRect != null) {
    popClipRect(state);
  }
}

export function pushClipRect(state: CanvasRendererState, rect: Rectangle, transform: Matrix3x2): void {
  state.context.save();

  setTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

export function pushMask(state: CanvasRendererState, mask: RenderableData): void {
  state.context.save();

  setTransform(state, state.context, mask.transform);

  state.context.beginPath();
  // renderDrawableMask(state, mask);
  state.context.closePath();

  state.context.clip();
}

export function pushMaskObject(
  state: CanvasRendererState,
  object: RenderableData,
  handleScrollRect: boolean = true,
): void {
  if (handleScrollRect && object.source.scrollRect !== null) {
    pushClipRect(state, object.source.scrollRect, object.transform);
  }
  if (/*!object.__isCacheBitmapRender &&*/ object.mask !== null) {
    pushMask(state, object.mask);
  }
}

export function setBlendMode(state: CanvasRendererState, value: BlendMode | null): void {
  // if (overrideBlendMode !== null) value = overrideBlendMode;
  if (value === state.currentBlendMode) return;

  state.currentBlendMode = value;
  const context = state.context;

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

export function setTransform(
  state: CanvasRendererState,
  context: CanvasRenderingContext2D,
  transform: Matrix3x2,
): void {
  if (state.roundPixels) {
    context.setTransform(
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      Math.fround(transform.tx),
      Math.fround(transform.ty),
    );
  } else {
    context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
  }
}
