import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, RenderProxy2D, WebGPUBitmapShader, WebGPURenderState } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';

const _shaderBindings = new WeakMap<RenderProxy2D, WebGPUBitmapShader>();

export function getWebGPUShader(renderProxy: RenderProxy2D): WebGPUBitmapShader | undefined {
  return _shaderBindings.get(renderProxy);
}

// Returns the per-node shader binding, or null when none is bound. The lookup is reached only
// through the installed resolver, so it and the binding map tree-shake until setWebGPUShader is used.
export function resolveWebGPUShader(state: WebGPURenderState, renderProxy: RenderProxy2D): WebGPUBitmapShader | null {
  const runtime = getWebGPURenderStateRuntime(state);
  const resolver = runtime.webgpuShaderBindingResolver;
  if (resolver !== undefined) {
    const shader = resolver(renderProxy);
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
  getWebGPURenderStateRuntime(state).webgpuShaderBindingResolver = getWebGPUShader;
}
