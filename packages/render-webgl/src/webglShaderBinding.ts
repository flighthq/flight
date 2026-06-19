import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, RenderProxy2D, WebGLRenderState } from '@flighthq/types';

import { getWebGLRenderStateRuntime } from './webglRenderState';
import type { WebGLBitmapShader } from './webglShaderTypes';

// Per-state shader bindings, keyed by the render node. Because render nodes are
// per-state (state.renderProxyMap), a module-level map keyed by render node is
// automatically isolated per state — a binding made for one render state's pass
// is invisible to any other state that renders the same display object. This
// mirrors the per-render-node texture maps in webglText / webglRichText.
const _shaderBindings = new WeakMap<RenderProxy2D, WebGLBitmapShader>();

export function getWebGLMaterialShader(state: WebGLRenderState, kind: symbol): WebGLBitmapShader | null {
  return getWebGLRenderStateRuntime(state).materialBitmapShaderMap?.get(kind) ?? null;
}

export function getWebGLShader(renderProxy: RenderProxy2D): WebGLBitmapShader | undefined {
  return _shaderBindings.get(renderProxy);
}

// Registers the bitmap shader to draw nodes whose material has the given kind. Keeps the render path
// generic: resolveWebGLShader looks shaders up by material kind and knows nothing about which kinds
// mean what. Material-specific knowledge (e.g. color transform) lives in the shader + this call.
export function registerWebGLMaterialShader(state: WebGLRenderState, kind: symbol, shader: WebGLBitmapShader): void {
  const runtime = getWebGLRenderStateRuntime(state);
  (runtime.materialBitmapShaderMap ??= new Map()).set(kind, shader);
}

/**
 * Returns the shader to draw renderProxy with: the per-node binding when one is
 * set, then the material-kind shader, otherwise the state's default bitmap shader.
 * The per-node lookup is reached only through the installed resolver, so it (and
 * the binding map) stay off the hot path and tree-shake until setWebGLShader is used.
 */
export function resolveWebGLShader(state: WebGLRenderState, renderProxy: RenderProxy2D): WebGLBitmapShader {
  const runtime = getWebGLRenderStateRuntime(state);
  const resolver = runtime.webglShaderBindingResolver;
  if (resolver !== undefined) {
    const shader = resolver(renderProxy);
    if (shader !== undefined) return shader;
  }
  const material = renderProxy.material;
  if (material !== null) {
    const shader = runtime.materialBitmapShaderMap?.get(material.kind);
    if (shader !== undefined) return shader;
  }
  return runtime.defaultBitmapShader;
}

/**
 * Binds a custom WebGL shader to a display object for the given render state, or
 * clears it when shader is null. The binding lives on the render state side, not
 * the scene graph, so the same display object can carry different shaders (or
 * none) in different render states — e.g. a custom shader for an offscreen pass
 * that the standard renderer has no memory of.
 */
export function setWebGLShader(state: WebGLRenderState, node: DisplayObject, shader: WebGLBitmapShader | null): void {
  const renderProxy = getOrCreateRenderProxy2D(state, node);
  if (shader === null) {
    _shaderBindings.delete(renderProxy);
    return;
  }
  _shaderBindings.set(renderProxy, shader);
  getWebGLRenderStateRuntime(state).webglShaderBindingResolver = getWebGLShader;
}
