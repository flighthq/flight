import { withKindMapEntry } from '@flighthq/registry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { ModifierKind, WgpuModifierSnippet, WgpuRenderState } from '@flighthq/types/contract';

// State-scoped, last-write-wins WGSL compiler registry. Unknown kinds are an expected miss and
// contribute nothing, matching scene-gl's open modifier compiler contract.
export function registerWgpuModifierSnippet(state: WgpuRenderState, snippet: Readonly<WgpuModifierSnippet>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.registries.modifierSnippets = withKindMapEntry(runtime.registries.modifierSnippets, snippet.kind, snippet);
  runtime.modifierSnippetRevision++;
}

export function resolveWgpuModifierSnippet(state: WgpuRenderState, kind: ModifierKind): WgpuModifierSnippet | null {
  const entry = getWgpuRenderStateRuntime(state).registries.modifierSnippets.get(kind);
  return entry ?? null;
}
