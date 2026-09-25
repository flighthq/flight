import { withKindMapEntry } from '@flighthq/registry/contract';
import type { CanvasQuadMaterialRenderer, CanvasRenderState, Kind, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState.ts';

// Applies a node's material draw-state delta before a canvas draw, bracketed with ctx.save().
// Returns true when it saved and the caller must ctx.restore() after drawing; false (no save) when
// there is no material or no registered renderer, so the common path pays nothing.
export function applyCanvasMaterial(state: CanvasRenderState, material: Material | null): boolean {
  if (material === null) return false;
  const renderer = resolveCanvasQuadMaterialRenderer(state, material);
  if (renderer === null) return false;
  const drawState = renderer.getState(material);
  const context = state.context;
  context.save();
  if (drawState.composite !== undefined) context.globalCompositeOperation = drawState.composite;
  if (drawState.filter !== undefined) context.filter = drawState.filter;
  return true;
}

export function getCanvasQuadMaterialRenderer(state: CanvasRenderState, kind: Kind): CanvasQuadMaterialRenderer | null {
  const entry = getCanvasRenderStateRuntime(state).registries.materialRenderers?.get(kind);
  return entry ?? null;
}

export function registerCanvasQuadMaterialRenderer(
  state: CanvasRenderState,
  kind: Kind,
  renderer: CanvasQuadMaterialRenderer,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  const table = runtime.registries.materialRenderers ?? new Map();
  runtime.registries.materialRenderers = withKindMapEntry(table, kind, renderer);
}

// Resolves a node's material to its Canvas renderer, else the registered default, else null.
// Unlike Gl there is no built-in fallback: a null result means "draw normally", since the
// canvas renderer already performs the draw and a material only contributes extra draw state.
export function resolveCanvasQuadMaterialRenderer(
  state: CanvasRenderState,
  material: Material | null,
): CanvasQuadMaterialRenderer | null {
  const table = getCanvasRenderStateRuntime(state).registries.materialRenderers;
  if (table === undefined) return null;
  if (material !== null) {
    const entry = table.get(material.kind);
    if (entry != null) return entry;
  }
  const fallback = table.get(StandardMaterialKind);
  return fallback ?? null;
}
