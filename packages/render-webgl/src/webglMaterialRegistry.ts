import type { Material, WebGLMaterialRenderer, WebGLRenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getWebGLRenderStateRuntime } from './webglRenderState';

export function getWebGLMaterialRenderer(state: WebGLRenderState, kind: symbol): WebGLMaterialRenderer | null {
  return getWebGLRenderStateRuntime(state).materialRendererMap?.get(kind) ?? null;
}

export function registerWebGLMaterialRenderer(
  state: WebGLRenderState,
  kind: symbol,
  renderer: WebGLMaterialRenderer,
): void {
  const runtime = getWebGLRenderStateRuntime(state);
  (runtime.materialRendererMap ??= new Map()).set(kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for DefaultMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveWebGLMaterialRenderer(
  state: WebGLRenderState,
  material: Material | null,
): WebGLMaterialRenderer | null {
  const map = getWebGLRenderStateRuntime(state).materialRendererMap;
  if (map === undefined) return null;
  if (material !== null) {
    const renderer = map.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return map.get(DefaultMaterialKind) ?? null;
}
