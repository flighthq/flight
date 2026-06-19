import type { Material, WebGPUMaterialRenderer, WebGPURenderState } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';

export function getWebGPUMaterialRenderer(state: WebGPURenderState, kind: symbol): WebGPUMaterialRenderer | null {
  const runtime = getWebGPURenderStateRuntime(state);
  return runtime.materialRendererMap?.get(kind) ?? null;
}

export function registerWebGPUMaterialRenderer(
  state: WebGPURenderState,
  kind: symbol,
  renderer: WebGPUMaterialRenderer,
): void {
  const runtime = getWebGPURenderStateRuntime(state);
  (runtime.materialRendererMap ??= new Map()).set(kind, renderer);
}

// Resolves a node's material to its registered renderer: by the material's kind, else the renderer
// registered for DefaultMaterialKind, else null. The render path knows nothing about which materials
// exist — every material (including the default) enters only through user registration, and an
// unresolved material is a no-op (the node does not render), never a built-in fallback.
export function resolveWebGPUMaterialRenderer(
  state: WebGPURenderState,
  material: Material | null,
): WebGPUMaterialRenderer | null {
  const runtime = getWebGPURenderStateRuntime(state);
  const map = runtime.materialRendererMap;
  if (map === undefined) return null;
  if (material !== null) {
    const renderer = map.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return map.get(DefaultMaterialKind) ?? null;
}
