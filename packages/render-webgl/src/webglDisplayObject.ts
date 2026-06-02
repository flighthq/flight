import { hasRenderFeatures } from '@flighthq/render-core';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type {
  DisplayObject,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  WebGLRenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { popWebGLClipRectangle, pushWebGLClipRectangle } from './webglClipRect';
import { applyWebGLMask, popWebGLMask, pushWebGLMask } from './webglMask';

export function drawWebGLDisplayObject(_state: WebGLRenderState, _renderNode: DisplayObjectRenderTreeNode): void {
  // Plain display objects have no visual geometry of their own.
}

export function drawWebGLDisplayObjectMask(state: WebGLRenderState, data: DisplayObjectRenderTreeNode): void {
  const children = getDisplayObjectRuntime(data.source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getOrCreateDisplayObjectRenderNode(state, children[i] as DisplayObject);
      applyWebGLMask(state as WebGLRenderStateInternal, child);
    }
  }
}

export function renderWebGLDisplayObject(state: WebGLRenderState, source: DisplayObject): void {
  const internal = state as WebGLRenderStateInternal;
  drawNode(internal, source);
}

export const defaultWebGLDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: () => null,
  draw: drawWebGLDisplayObject,
  drawMask: drawWebGLDisplayObjectMask,
};

function drawNode(state: WebGLRenderStateInternal, current: DisplayObject): void {
  const data = getOrCreateDisplayObjectRenderNode(state, current);

  const isMask = data.isMaskFrameID === state.currentFrameID;
  if (isMask) return;

  const shouldRender = data.visible && data.alpha > 0 && (data.transform2D.a !== 0 || data.transform2D.d !== 0);
  if (!shouldRender) return;

  pushObjectEffects(state, data);

  if (data.renderer !== null) {
    data.renderer.draw(state, data);
  }

  if (data.updateChildren) {
    const children = getDisplayObjectRuntime(current).children;
    if (children !== null) {
      for (let i = 0; i < children.length; i++) {
        drawNode(state, children[i] as DisplayObject);
      }
    }
  }

  popObjectEffects(state, data);
}

function popObjectEffects(state: WebGLRenderStateInternal, data: DisplayObjectRenderTreeNode): void {
  const source = data.source;
  if (hasRenderFeatures(state, RenderFeatures.Masks) && source.mask !== null) popWebGLMask(state);
  if (hasRenderFeatures(state, RenderFeatures.ScrollRect) && source.scrollRect !== null) popWebGLClipRectangle(state);
}

function pushObjectEffects(state: WebGLRenderStateInternal, data: DisplayObjectRenderTreeNode): void {
  const source = data.source;
  if (hasRenderFeatures(state, RenderFeatures.ScrollRect) && source.scrollRect !== null)
    pushWebGLClipRectangle(state, source.scrollRect, data.transform2D);
  if (hasRenderFeatures(state, RenderFeatures.Masks) && source.mask !== null)
    pushWebGLMask(state, getOrCreateDisplayObjectRenderNode(state, source.mask));
}
