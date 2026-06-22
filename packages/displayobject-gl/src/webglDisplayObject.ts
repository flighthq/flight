import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { DisplayObject, DisplayObjectRenderer, GlRenderState, RenderProxy2D } from '@flighthq/types';

import { flushGlSpriteBatch } from './webglSpriteBatch';

export function drawGlDisplayObject(_state: GlRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function renderGlDisplayObject(state: GlRenderState, source: DisplayObject): void {
  const tempStack = getGlRenderStateRuntime(state).tempStack;
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as DisplayObject;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushClip(state, data, current);

    data.renderer?.submit(state, data);
    if (data.traverseChildren) {
      const children = getDisplayObjectRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as DisplayObject;
        }
      }
    }
  }

  flushGlSpriteBatch(state);
  clipHooks?.finalize(state);
}

export const defaultGlDisplayObjectRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawGlDisplayObject,
};
