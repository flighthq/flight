import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import type { CanvasMaterialRenderer, CanvasRenderState, Kind, Material } from '@flighthq/types/contract';
import { RegistryEntryState, StandardMaterialKind } from '@flighthq/types/contract';

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

export function getCanvasMaterialRenderer(state: CanvasRenderState, kind: Kind): CanvasMaterialRenderer | null {
  const entry = getCanvasRenderStateRuntime(state).registries.materialRenderers?.entries.get(kind);
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function registerCanvasMaterialRenderer(
  state: CanvasRenderState,
  kind: Kind,
  renderer: CanvasMaterialRenderer,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  const table = runtime.registries.materialRenderers ?? createKeyedTable('CanvasMaterialRenderer', 'StandardMaterial');
  runtime.registries.materialRenderers = withRegistryTableEntry(table, kind, renderer);
}

// Resolves a node's material to its Canvas renderer, else the registered default, else null.
// Unlike Gl there is no built-in fallback: a null result means "draw normally", since the
// canvas renderer already performs the draw and a material only contributes extra draw state.
export function resolveCanvasMaterialRenderer(
  state: CanvasRenderState,
  material: Material | null,
): CanvasMaterialRenderer | null {
  const entries = getCanvasRenderStateRuntime(state).registries.materialRenderers?.entries;
  if (entries === undefined) return null;
  if (material !== null) {
    const entry = entries.get(material.kind);
    if (entry?.state === RegistryEntryState.Bound) return entry.value;
  }
  const fallback = entries.get(StandardMaterialKind);
  return fallback?.state === RegistryEntryState.Bound ? fallback.value : null;
}
