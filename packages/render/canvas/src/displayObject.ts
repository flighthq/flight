import { rectangle } from '@flighthq/geometry';
import { getRenderNode, registerRenderer } from '@flighthq/render-core';
import { calculateBoundsRect } from '@flighthq/scene-graph-stage';
import {
  type CanvasRenderState,
  DisplayObjectKind,
  type Renderable,
  type Renderer,
  type RendererData,
  type RenderNode,
} from '@flighthq/types';

import { applyMask } from './masks';
import { setBlendMode } from './materials';
import { setTransform } from './transform';

export const DisplayObjectRenderer: Renderer = {
  applyMask: applyDisplayObjectMask,
  createData: createDisplayObjectRendererData,
  render: renderDisplayObject,
};

export function applyDisplayObjectMask(state: CanvasRenderState, data: RenderNode): void {
  const source = data.source;
  if (source.opaqueBackground !== null) {
    calculateBoundsRect(tempBounds, source, source);
    state.context.rect(0, 0, tempBounds.width, tempBounds.width);
  } else {
    const children = source.children;
    if (children !== null) {
      for (let i = 0; i < children.length; i++) {
        const data = getRenderNode(state, children[i]);
        applyMask(state, data);
      }
    }
  }
}

export function createDisplayObjectRendererData(_state: CanvasRenderState, _source: Renderable): RendererData | null {
  return null;
}

export function registerDisplayObjectRenderer(
  state: CanvasRenderState,
  renderer: Renderer = DisplayObjectRenderer,
): void {
  registerRenderer(state, DisplayObjectKind, renderer);
}

export function renderDisplayObject(state: CanvasRenderState, displayObject: RenderNode): void {
  const opaqueBackground = displayObject.source.opaqueBackground;
  if (opaqueBackground === null) return;

  setBlendMode(state, displayObject.blendMode);

  const context = state.context;

  setTransform(state, context, displayObject.transform);

  const r = (opaqueBackground >> 16) & 0xff;
  const g = (opaqueBackground >> 8) & 0xff;
  const b = opaqueBackground & 0xff;
  context.fillStyle = `rgb(${r},${g},${b})`;

  // getLocalBoundsRect does not include children
  calculateBoundsRect(tempBounds, displayObject.source, displayObject.source);
  context.fillRect(0, 0, tempBounds.width, tempBounds.height);
}

const tempBounds = rectangle.create();
