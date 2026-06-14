import { getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getDisplayObjectRenderNode } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderNode } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';

export function drawWebGLMask(state: WebGLRenderStateInternal, data: DisplayObjectRenderNode): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);

  if (!data.traverseChildren) return;

  const children = getDisplayObjectRuntime(data.source as DisplayObject).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getDisplayObjectRenderNode(state, children[i] as DisplayObject);
      if (child !== undefined) drawWebGLMask(state, child);
    }
  }
}

export function popWebGLMask(state: WebGLRenderStateInternal): void {
  const gl = state.gl;
  const nextDepth = Math.max(0, (state.currentMaskDepth ?? 0) - 1);
  state.currentMaskDepth = nextDepth;

  if (nextDepth === 0) {
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
  } else {
    gl.stencilFunc(gl.EQUAL, nextDepth, 0xff);
  }
}

export function pushWebGLMask(state: WebGLRenderStateInternal, data: DisplayObjectRenderNode): void {
  const gl = state.gl;
  const depth = state.currentMaskDepth ?? 0;
  const nextDepth = depth + 1;

  if (depth === 0) {
    gl.enable(gl.STENCIL_TEST);
    gl.clear(gl.STENCIL_BUFFER_BIT);
  }

  gl.colorMask(false, false, false, false);
  gl.stencilMask(0xff);
  gl.stencilFunc(gl.ALWAYS, nextDepth, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

  drawWebGLMask(state, data);

  gl.colorMask(true, true, true, true);
  gl.stencilMask(0x00);
  gl.stencilFunc(gl.EQUAL, nextDepth, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  state.currentMaskDepth = nextDepth;
}
