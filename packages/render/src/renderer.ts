import { getRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import type { Kind, Renderable, Renderer, RendererData, RenderState } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

// Mask renderers were retired (a mask is now a path ClipRegion realized by the backend clip hooks), so
// there is no mask-renderer registry to copy — only the kind→renderer map and the clip hooks.
export function copyAllRenderersFromRenderState(target: RenderState, source: RenderState): void {
  copyRenderersFromRenderState(target, source);
  if (source.displayObjectClipHooks !== null) target.displayObjectClipHooks = source.displayObjectClipHooks;
}

export function copyRenderersFromRenderState(target: RenderState, source: RenderState): void {
  const targetRuntime = getRenderStateRuntime(target);
  const sourceTable = getRenderStateRuntime(source).registries.renderers;
  const targetTable = targetRuntime.registries.renderers;

  // A fresh derived pipeline can share the immutable source snapshot directly. A target that already
  // has policy keeps its target-only registrations, matching the additive copy contract, while source
  // bindings remain last-write-wins through registerRenderer.
  if (targetTable.entries.size === 0) {
    let registrationCount = 0;
    for (const entry of sourceTable.entries.values()) {
      if (entry.state === RegistryEntryState.Bound) registrationCount++;
    }
    if (registrationCount === 0) return;
    targetRuntime.registries.renderers = sourceTable;
    targetRuntime.rendererMapId = (targetRuntime.rendererMapId + registrationCount) >>> 0;
    return;
  }

  for (const [kind, entry] of sourceTable.entries) {
    if (entry.state === RegistryEntryState.Bound) registerRenderer(target, kind, entry.value);
  }
}

// Copies the backend-agnostic policy registries that participate in pipeline derivation. Persistent
// tables share an immutable snapshot through distinct aggregates, so later replacements diverge until
// an explicit re-copy.
export function copyRenderStateRegistrations(target: RenderState, source: RenderState): void {
  const targetRuntime = getRenderStateRuntime(target);
  const sourceRuntime = getRenderStateRuntime(source);
  targetRuntime.colorAdjustmentResolver = sourceRuntime.colorAdjustmentResolver;
  targetRuntime.registries.effectPaddingResolvers = sourceRuntime.registries.effectPaddingResolvers;
  // The shape-command set is base policy every backend replays through, so a pipeline that inherits
  // the renderers must inherit the commands too. Without it an offscreen state resolves no handler for
  // any command in a shape's stream and bakes an empty target.
  targetRuntime.registries.canvasShapeCommands = sourceRuntime.registries.canvasShapeCommands;
}

export function noopRendererData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function registerRenderer(state: RenderState, kind: Kind, renderer: Renderer): void {
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.renderers;
  if (getRegistryTableEntry(table, kind) === renderer) return;
  runtime.registries.renderers = withRegistryTableEntry(table, kind, renderer);
  runtime.rendererMapId = (runtime.rendererMapId + 1) >>> 0;
}

// Batch form of registerRenderer over a caller-supplied set of [kind, renderer] pairs. The registry
// stays open and tree-shakable: only the renderers the caller references are pulled in — there is no
// "register all built-ins" set, which would force every renderer into the bundle.
export function registerRenderers(state: RenderState, entries: ReadonlyArray<readonly [Kind, Renderer]>): void {
  for (const [kind, renderer] of entries) registerRenderer(state, kind, renderer);
}
