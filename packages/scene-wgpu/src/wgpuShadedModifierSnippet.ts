import { createModifierRegistry, registerModifier, resolveModifier } from '@flighthq/shading';
import type { ModifierKind, WgpuModifierSnippet, WgpuRenderState } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// State-scoped, last-write-wins WGSL compiler registry. Unknown kinds are an expected miss and
// contribute nothing, matching scene-gl's open modifier compiler contract.
export function registerWgpuModifierSnippet(state: WgpuRenderState, snippet: Readonly<WgpuModifierSnippet>): void {
  const runtime = getWgpuSceneRuntime(state);
  if (runtime.modifierSnippetRegistry === null) runtime.modifierSnippetRegistry = createModifierRegistry();
  registerModifier(runtime.modifierSnippetRegistry, snippet);
  runtime.modifierSnippetRevision++;
}

export function resolveWgpuModifierSnippet(state: WgpuRenderState, kind: ModifierKind): WgpuModifierSnippet | null {
  const registry = getWgpuSceneRuntime(state).modifierSnippetRegistry;
  if (registry === null) return null;
  return resolveModifier(registry, kind) as WgpuModifierSnippet | null;
}
