import { enableRenderFeatures, getOrCreateRenderNode2D, hasRenderFeatures } from '@flighthq/render';
import { type DisplayObject, RenderFeatures, type RenderNode2D, type WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import type { WebGLBitmapShader } from './webglShaderTypes';

// Per-state shader bindings, keyed by the render node. Because render nodes are
// per-state (state.renderNodeMap), a module-level map keyed by render node is
// automatically isolated per state — a binding made for one render state's pass
// is invisible to any other state that renders the same display object. This
// mirrors the per-render-node texture maps in webglText / webglRichText.
const _shaderBindings = new WeakMap<RenderNode2D, WebGLBitmapShader>();

export function getWebGLMaterialShader(state: WebGLRenderState, kind: symbol): WebGLBitmapShader | null {
  return (state as WebGLRenderStateInternal).materialBitmapShaderMap?.get(kind) ?? null;
}

export function getWebGLShader(renderNode: RenderNode2D): WebGLBitmapShader | undefined {
  return _shaderBindings.get(renderNode);
}

// Registers the bitmap shader to draw nodes whose material has the given kind. Keeps the render path
// generic: resolveWebGLShader looks shaders up by material kind and knows nothing about which kinds
// mean what. Material-specific knowledge (e.g. color transform) lives in the shader + this call.
export function registerWebGLMaterialShader(state: WebGLRenderState, kind: symbol, shader: WebGLBitmapShader): void {
  const internal = state as WebGLRenderStateInternal;
  (internal.materialBitmapShaderMap ??= new Map()).set(kind, shader);
}

/**
 * Returns the shader to draw renderNode with: the per-node binding when one is
 * set and shader support is enabled for the state, otherwise the state's default
 * bitmap shader. The feature gate keeps the binding lookup off the hot path until
 * at least one shader has been bound.
 */
export function resolveWebGLShader(state: WebGLRenderStateInternal, renderNode: RenderNode2D): WebGLBitmapShader {
  if (hasRenderFeatures(state, RenderFeatures.Shaders)) {
    const shader = _shaderBindings.get(renderNode);
    if (shader !== undefined) return shader;
  }
  const material = renderNode.material;
  if (material !== null) {
    const shader = state.materialBitmapShaderMap?.get(material.kind);
    if (shader !== undefined) return shader;
  }
  return state.defaultBitmapShader;
}

/**
 * Binds a custom WebGL shader to a display object for the given render state, or
 * clears it when shader is null. The binding lives on the render state side, not
 * the scene graph, so the same display object can carry different shaders (or
 * none) in different render states — e.g. a custom shader for an offscreen pass
 * that the standard renderer has no memory of.
 */
export function setWebGLShader(state: WebGLRenderState, node: DisplayObject, shader: WebGLBitmapShader | null): void {
  const renderNode = getOrCreateRenderNode2D(state, node);
  if (shader === null) {
    _shaderBindings.delete(renderNode);
    return;
  }
  _shaderBindings.set(renderNode, shader);
  enableRenderFeatures(state, RenderFeatures.Shaders);
}
