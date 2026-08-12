import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { getRenderProxy2D, isRenderProxyVisible, noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type { Node2D, Scene2DRenderer, GlRenderState, RenderProxy2D } from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';

export function drawGlScene2D(_state: GlRenderState, _renderProxy: RenderProxy2D): void {
  // Plain display objects have no visual geometry of their own.
}

export function renderGlScene2D(state: GlRenderState, source: Node2D): void {
  const gl = state.gl;
  // The 2D pass declares the state it draws under instead of inheriting it. Both of these were
  // previously taken on trust from createGlRenderState, which runs once per state, so any pass that
  // flipped one — the 3D mesh path enables both per draw — silently changed how 2D content rasterized
  // from that point on. Culling is the destructive one: the 2D quad is wound (x0,y0)(x1,y0)(x1,y1) in
  // a y-down space that the projection flips, making it a BACK face under the CCW default, so leaving
  // CULL_FACE enabled erases 2D content completely rather than degrading it.
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);

  const tempStack = getGlRenderStateRuntime(state).tempStack;
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

  flushGlQuadBatchWriter(state);
  clipHooks?.finalize(state);
}

export const defaultGlScene2DRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawGlScene2D,
};
