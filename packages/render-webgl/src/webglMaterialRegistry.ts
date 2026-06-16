import type { Material, WebGLMaterialRenderer, WebGLRenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import {
  bindWebGLQuadBatchBaseAttributes,
  ensureWebGLQuadBatchShader,
  setWebGLQuadBatchWorldAndTexture,
  useWebGLQuadBatchProgram,
} from './webglSpriteBatch';

export function getWebGLMaterialRenderer(state: WebGLRenderState, kind: symbol): WebGLMaterialRenderer | null {
  return (state as WebGLRenderStateInternal).materialRendererMap?.get(kind) ?? null;
}

export function registerDefaultWebGLMaterial(state: WebGLRenderState): void {
  registerWebGLMaterialRenderer(state, DefaultMaterialKind, defaultWebGLMaterialRenderer);
}

export function registerWebGLMaterialRenderer(
  state: WebGLRenderState,
  kind: symbol,
  renderer: WebGLMaterialRenderer,
): void {
  const internal = state as WebGLRenderStateInternal;
  (internal.materialRendererMap ??= new Map()).set(kind, renderer);
}

// Resolves a node's material to the renderer that draws it: its registered renderer, else the
// registered default, else the built-in default. Never returns null, so an unregistered or
// missing material degrades to the standard pipeline rather than erroring.
export function resolveWebGLMaterialRenderer(
  state: WebGLRenderState,
  material: Material | null,
): WebGLMaterialRenderer {
  const map = (state as WebGLRenderStateInternal).materialRendererMap;
  if (map !== undefined) {
    if (material !== null) {
      const renderer = map.get(material.kind);
      if (renderer !== undefined) return renderer;
    }
    const fallback = map.get(DefaultMaterialKind);
    if (fallback !== undefined) return fallback;
  }
  return defaultWebGLMaterialRenderer;
}

// The standard sprite-batch pipeline: no color transform, no per-instance material data.
export const defaultWebGLMaterialRenderer: WebGLMaterialRenderer = {
  instanceFloatCount: 0,
  bind(state: WebGLRenderState): void {
    const internal = state as WebGLRenderStateInternal;
    const shader = ensureWebGLQuadBatchShader(internal);
    useWebGLQuadBatchProgram(internal, shader.program);
    setWebGLQuadBatchWorldAndTexture(internal, shader.locWorldMatrix, shader.locTexture);
    if (shader.locHasColorTransform !== null) internal.gl.uniform1i(shader.locHasColorTransform, 0);
    bindWebGLQuadBatchBaseAttributes(internal, shader.locCorner);
  },
};
