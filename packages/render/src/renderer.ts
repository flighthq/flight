import { withKindMapEntry } from '@flighthq/registry/contract';
import type { Kind, NodeAny, NodeRenderer, RendererData, RenderState } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState.ts';

// Mask renderers were retired (a mask is now a path ClipRegion realized by the backend clip hooks), so
// there is no mask-renderer registry to copy — only the kind→renderer map and the clip hooks.
export function copyAllRenderersFromRenderState(target: RenderState, source: RenderState): void {
  copyRenderersFromRenderState(target, source);
  if (source.displayObjectClipHooks !== null) target.displayObjectClipHooks = source.displayObjectClipHooks;
}

export function copyRenderersFromRenderState(target: RenderState, source: RenderState): void {
  const targetRuntime = getRenderStateRuntime(target);
  const sourceTable = getRenderStateRuntime(source).registries.nodeRenderers;
  const targetTable = targetRuntime.registries.nodeRenderers;

  // A fresh derived pipeline can share the immutable source snapshot directly. A target that already
  // has policy keeps its target-only registrations, matching the additive copy contract, while source
  // bindings remain last-write-wins through registerNodeRenderer.
  if (targetTable.size === 0) {
    if (sourceTable.size === 0) return;
    targetRuntime.registries.nodeRenderers = sourceTable;
    targetRuntime.rendererMapId = (targetRuntime.rendererMapId + sourceTable.size) >>> 0;
    return;
  }

  for (const [kind, renderer] of sourceTable) {
    registerNodeRenderer(target, kind, renderer);
  }
}

// Copies the backend-agnostic policy registries that participate in pipeline derivation. Persistent
// tables share an immutable snapshot through distinct aggregates, so later replacements diverge until
// an explicit re-copy.
export function copyRenderStateRegistrations(target: RenderState, source: RenderState): void {
  const targetRuntime = getRenderStateRuntime(target);
  const sourceRuntime = getRenderStateRuntime(source);
  targetRuntime.registries.colorAdjustments = sourceRuntime.registries.colorAdjustments;
  targetRuntime.registries.colorAdjustmentUnsupportedGuard = sourceRuntime.registries.colorAdjustmentUnsupportedGuard;
  targetRuntime.registries.effectPaddingResolvers = sourceRuntime.registries.effectPaddingResolvers;
  targetRuntime.registries.renderRootGuard = sourceRuntime.registries.renderRootGuard;
  // The shape-command set is base policy every backend replays through, so a pipeline that inherits
  // the renderers must inherit the commands too. Without it an offscreen state resolves no handler for
  // any command in a shape's stream and bakes an empty target.
  targetRuntime.registries.canvasShapeCommands = sourceRuntime.registries.canvasShapeCommands;
  targetRuntime.registries.strokeTessellator = sourceRuntime.registries.strokeTessellator;
}

export function noopRendererData(_state: RenderState, _source: NodeAny): RendererData | null {
  return null;
}

export function registerNodeRenderer(state: RenderState, kind: Kind, renderer: NodeRenderer): void {
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.nodeRenderers;
  if (table.get(kind) === renderer) return;
  runtime.registries.nodeRenderers = withKindMapEntry(table, kind, renderer);
  runtime.rendererMapId = (runtime.rendererMapId + 1) >>> 0;
}

// Batch form of registerNodeRenderer over a caller-supplied set of [kind, renderer] pairs. The registry
// stays open and tree-shakable: only the renderers the caller references are pulled in — there is no
// "register all built-ins" set, which would force every renderer into the bundle.
export function registerNodeRenderers(state: RenderState, entries: ReadonlyArray<readonly [Kind, NodeRenderer]>): void {
  for (const [kind, renderer] of entries) registerNodeRenderer(state, kind, renderer);
}
