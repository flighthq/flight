import { enableRenderFeatures, getOrCreateRenderProxy2D, hasRenderFeatures } from '@flighthq/render';
import type { DisplayObject, RenderProxy2D, WebGPURenderState } from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import type { WebGPUBitmapShader, WebGPURenderStateInternal } from './internal';

const _shaderBindings = new WeakMap<RenderProxy2D, WebGPUBitmapShader>();

export function getWebGPUShader(renderProxy: RenderProxy2D): WebGPUBitmapShader | undefined {
  return _shaderBindings.get(renderProxy);
}

export function resolveWebGPUShader(
  state: WebGPURenderStateInternal,
  renderProxy: RenderProxy2D,
): WebGPUBitmapShader | null {
  if (hasRenderFeatures(state, RenderFeatures.Shaders)) {
    const shader = _shaderBindings.get(renderProxy);
    if (shader !== undefined) return shader;
  }
  return null;
}

export function setWebGPUShader(
  state: WebGPURenderState,
  node: DisplayObject,
  shader: WebGPUBitmapShader | null,
): void {
  const renderProxy = getOrCreateRenderProxy2D(state, node);
  if (shader === null) {
    _shaderBindings.delete(renderProxy);
    return;
  }
  _shaderBindings.set(renderProxy, shader);
  enableRenderFeatures(state, RenderFeatures.Shaders);
}
