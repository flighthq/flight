import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, RenderProxy2D, WgpuBitmapShader, WgpuRenderState } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

const _shaderBindings = new WeakMap<RenderProxy2D, WgpuBitmapShader>();

export function getWgpuShader(renderProxy: RenderProxy2D): WgpuBitmapShader | undefined {
  return _shaderBindings.get(renderProxy);
}

// Returns the per-node shader binding, or null when none is bound. The lookup is reached only
// through the installed resolver, so it and the binding map tree-shake until setWgpuShader is used.
export function resolveWgpuShader(state: WgpuRenderState, renderProxy: RenderProxy2D): WgpuBitmapShader | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const resolver = runtime.webgpuShaderBindingResolver;
  if (resolver !== undefined) {
    const shader = resolver(renderProxy);
    if (shader !== undefined) return shader;
  }
  return null;
}

export function setWgpuShader(state: WgpuRenderState, node: DisplayObject, shader: WgpuBitmapShader | null): void {
  const renderProxy = getOrCreateRenderProxy2D(state, node);
  if (shader === null) {
    _shaderBindings.delete(renderProxy);
    return;
  }
  _shaderBindings.set(renderProxy, shader);
  getWgpuRenderStateRuntime(state).webgpuShaderBindingResolver = getWgpuShader;
}
