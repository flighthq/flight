import { getWorldTransform } from '@flighthq/stage';
import type {
  CanvasRendererState,
  DisplayObject,
  Matrix3x2,
  Rectangle,
  Renderable,
  RenderableData,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';
import { isRenderableDirty } from './dirty';

export function renderCanvas(state: CanvasRendererState, source: Renderable): void {
  const dirty = updateRenderQueue(state, source);
  if (dirty) {
    clear(state);
    flushRenderQueue(state);
  }
}

function clear(state: CanvasRendererState): void {
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

function flushRenderQueue(state: CanvasRendererState): void {
  // const renderQueue = state.renderQueue;
  const renderQueueLength = state.renderQueueLength;

  for (let i = 0; i < renderQueueLength; i++) {
    // const renderData = renderQueue[i];
    // switch (renderData.type) {
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

function popMask(state: CanvasRendererState): void {
  state.context.restore();
}

function popClipRect(state: CanvasRendererState): void {
  state.context.restore();
}

function popMaskObject(state: CanvasRendererState, object: RenderableData, handleScrollRect: boolean = true): void {
  if (/*!object.__isCacheBitmapRender && */ object.source.mask !== null) {
    popMask(state);
  }

  if (handleScrollRect && object.source.scrollRect != null) {
    popClipRect(state);
  }
}

function pushClipRect(state: CanvasRendererState, rect: Rectangle, transform: Matrix3x2): void {
  state.context.save();

  setTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

function pushMask(state: CanvasRendererState, mask: RenderableData): void {
  state.context.save();

  setTransform(state, state.context, mask.renderTransform);

  state.context.beginPath();
  // renderDrawableMask(state, mask);
  state.context.closePath();

  state.context.clip();
}

function pushMaskObject(state: CanvasRendererState, object: RenderableData, handleScrollRect: boolean = true): void {
  if (handleScrollRect && object.source.scrollRect !== null) {
    pushClipRect(state, object.source.scrollRect, object.renderTransform);
  }
  if (/*!object.__isCacheBitmapRender &&*/ object.mask !== null) {
    pushMask(state, object.mask);
  }
}

function setBlendMode(state: CanvasRendererState, value: BlendMode | null): void {
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

function setTransform(state: CanvasRendererState, context: CanvasRenderingContext2D, transform: Matrix3x2): void {
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

function updateRenderQueue(state: CanvasRendererState, source: DisplayObject): boolean {
  const renderableStack = state.renderableStack;
  const renderDataMap = state.renderData;
  const renderQueue = state.renderQueue;

  let dirty = false;
  let parentAlpha = 1;
  let renderQueueIndex = 0;

  let renderableStackLength = 1;
  renderableStack[0] = source;

  while (renderableStackLength > 0) {
    const current = renderableStack[--renderableStackLength];
    const renderData =
      renderDataMap.get(current) ?? renderDataMap.set(current, createRenderableData(current)).get(current)!;

    if (!dirty) dirty = isRenderableDirty(renderData);
    if (!current.visible) continue;

    const mask = current.mask;
    if (mask !== null) {
      const maskRenderData = renderDataMap.get(mask) ?? renderDataMap.set(mask, createRenderableData(mask)).get(mask)!;
      if (!dirty) dirty = isRenderableDirty(maskRenderData);
      renderData.mask = maskRenderData;
    }

    const renderAlpha = current.alpha * parentAlpha;
    renderData.renderAlpha = renderAlpha;
    renderData.renderTransform = getWorldTransform(source);

    renderQueue[renderQueueIndex++] = renderData;

    if (current.children !== null) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        // Add child to stack for further traversal
        renderableStack[renderableStackLength++] = current.children[i];
      }
    }

    parentAlpha = renderAlpha;
  }

  state.renderQueueLength = renderQueueIndex;
  return dirty;
}
