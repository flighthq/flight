import { setDisplayObjectMaskHooks } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { getDisplayObjectRuntime } from '@flighthq/scene-display';
import type {
  DisplayObject,
  DisplayObjectMaskHooks,
  DisplayObjectRenderTreeNode,
  WebGLRenderState,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';

export function drawWebGLMask(state: WebGLRenderStateInternal, data: DisplayObjectRenderTreeNode): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);

  if (!data.updateChildren) return;

  const children = getDisplayObjectRuntime(data.source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = getOrCreateDisplayObjectRenderNode(state, children[i] as DisplayObject);
      drawWebGLMask(state, child);
    }
  }
}

export function enableWebGLMaskSupport(state: WebGLRenderState): void {
  setDisplayObjectMaskHooks(state, webGLMaskHooks);
}

export function popWebGLMask(state: WebGLRenderStateInternal, _data: DisplayObjectRenderTreeNode): void {
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

export function pushWebGLMask(state: WebGLRenderStateInternal, data: DisplayObjectRenderTreeNode): void {
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

const webGLMaskHooks: DisplayObjectMaskHooks = {
  popMask: popWebGLMask,
  pushMask: pushWebGLMask,
};
