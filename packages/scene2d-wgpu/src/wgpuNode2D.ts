import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { Node2D, Scene2DRenderer, RenderProxy2D, WgpuRenderState } from '@flighthq/types/contract';

import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

export function drawWgpuScene2D(_state: WgpuRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function renderWgpuScene2D(state: WgpuRenderState, source: Node2D): void {
  const tempStack = getWgpuRenderStateRuntime(state).tempStack;
  const clipHooks = state.displayObjectClipHooks;

  let stackLength = 1;
  tempStack[0] = source;

  while (stackLength > 0) {
    const current = tempStack[--stackLength] as Node2D;
    if (!current.enabled) continue;

    const data = getRenderProxy2D(state, current);
    if (data === undefined) continue;

    clipHooks?.popClip(state, data, current);

    if (!isRenderProxyVisible(data)) continue;

    clipHooks?.pushClip(state, data, current);

    data.renderer?.submit(state, data);
    if (data.traverseChildren) {
      const children = getNode2DRuntime(current).children;
      if (children !== null) {
        for (let i = children.length - 1; i >= 0; i--) {
          tempStack[stackLength++] = children[i] as Node2D;
        }
      }
    }
  }

  flushWgpuSpriteBatch(state);
  clipHooks?.finalize(state);
}

export const defaultWgpuScene2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawWgpuScene2D,
};
