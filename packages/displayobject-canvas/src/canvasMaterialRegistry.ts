import type { CanvasMaterialRenderer, CanvasRenderState, Material } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

// Applies a node's material draw-state delta before a canvas draw, bracketed with ctx.save().
// Returns true when it saved and the caller must ctx.restore() after drawing; false (no save) when
// there is no material or no registered renderer, so the common path pays nothing.
export function applyCanvasMaterial(state: CanvasRenderState, material: Material | null): boolean {
  if (material === null) return false;
  const renderer = resolveCanvasMaterialRenderer(state, material);
  if (renderer === null) return false;
  const drawState = renderer.getState(material);
  const context = state.context;
  context.save();
  if (drawState.composite !== undefined) context.globalCompositeOperation = drawState.composite;
  if (drawState.filter !== undefined) context.filter = drawState.filter;
  return true;
}

export function getCanvasMaterialRenderer(state: CanvasRenderState, kind: symbol): CanvasMaterialRenderer | null {
  return getCanvasRenderStateRuntime(state).materialRendererMap?.get(kind) ?? null;
}

export function registerCanvasMaterialRenderer(
  state: CanvasRenderState,
  kind: symbol,
  renderer: CanvasMaterialRenderer,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  (runtime.materialRendererMap ??= new Map()).set(kind, renderer);
}

// Resolves a node's material to its Canvas renderer, else the registered default, else null.
// Unlike Gl there is no built-in fallback: a null result means "draw normally", since the
// canvas renderer already performs the draw and a material only contributes extra draw state.
export function resolveCanvasMaterialRenderer(
  state: CanvasRenderState,
  material: Material | null,
): CanvasMaterialRenderer | null {
  const map = getCanvasRenderStateRuntime(state).materialRendererMap;
  if (map === undefined) return null;
  if (material !== null) {
    const renderer = map.get(material.kind);
    if (renderer !== undefined) return renderer;
  }
  return map.get(DefaultMaterialKind) ?? null;
}
