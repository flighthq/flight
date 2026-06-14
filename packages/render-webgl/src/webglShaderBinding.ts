import { enableRenderFeatures, getOrCreateDisplayObjectRenderNode, hasRenderFeatures } from '@flighthq/render';
import {
  type DisplayObject,
  type DisplayObjectRenderNode,
  RenderFeatures,
  type WebGLRenderState,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import type { WebGLBitmapShader } from './webglShaderTypes';

// Per-state shader bindings, keyed by the render node. Because render nodes are
// per-state (state.renderNodeMap), a module-level map keyed by render node is
// automatically isolated per state — a binding made for one render state's pass
// is invisible to any other state that renders the same display object. This
// mirrors the per-render-node texture maps in webglText / webglRichText.
const _shaderBindings = new WeakMap<DisplayObjectRenderNode, WebGLBitmapShader>();

export function getWebGLShader(renderNode: DisplayObjectRenderNode): WebGLBitmapShader | undefined {
  return _shaderBindings.get(renderNode);
}

/**
 * Returns the shader to draw renderNode with: the per-node binding when one is
 * set and shader support is enabled for the state, otherwise the state's default
 * bitmap shader. The feature gate keeps the binding lookup off the hot path until
 * at least one shader has been bound.
 */
export function resolveWebGLShader(
  state: WebGLRenderStateInternal,
  renderNode: DisplayObjectRenderNode,
): WebGLBitmapShader {
  if (hasRenderFeatures(state, RenderFeatures.Shaders)) {
    const shader = _shaderBindings.get(renderNode);
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
  const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
  if (shader === null) {
    _shaderBindings.delete(renderNode);
    return;
  }
  _shaderBindings.set(renderNode, shader);
  enableRenderFeatures(state, RenderFeatures.Shaders);
}
