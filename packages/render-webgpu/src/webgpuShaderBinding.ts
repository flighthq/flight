import { enableRenderFeatures, getOrCreateDisplayObjectRenderNode, hasRenderFeatures } from '@flighthq/render';
import type { DisplayObject, DisplayObjectRenderNode, WebGPURenderState } from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { WebGPUBitmapShader, WebGPURenderStateInternal } from './internal';

const _shaderBindings = new WeakMap<DisplayObjectRenderNode, WebGPUBitmapShader>();

export function getWebGPUShader(renderNode: DisplayObjectRenderNode): WebGPUBitmapShader | undefined {
  return _shaderBindings.get(renderNode);
}

export function resolveWebGPUShader(
  state: WebGPURenderStateInternal,
  renderNode: DisplayObjectRenderNode,
): WebGPUBitmapShader | null {
  if (hasRenderFeatures(state, RenderFeatures.Shaders)) {
    const shader = _shaderBindings.get(renderNode);
    if (shader !== undefined) return shader;
  }
  return null;
}

export function setWebGPUShader(
  state: WebGPURenderState,
  node: DisplayObject,
  shader: WebGPUBitmapShader | null,
): void {
  const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
  if (shader === null) {
    _shaderBindings.delete(renderNode);
    return;
  }
  _shaderBindings.set(renderNode, shader);
  enableRenderFeatures(state, RenderFeatures.Shaders);
}
