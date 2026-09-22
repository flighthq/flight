import { withKindMapEntry } from '@flighthq/registry/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlModifierSnippet, GlRenderState, ModifierKind } from '@flighthq/types/contract';

// Registers (or replaces) the GL snippet for a modifier kind on this state's render policy. Opt-in
// and last-write-wins (a vendor-prefixed kind, or an override of a built-in, wins). Unregistered
// kinds contribute no GLSL, so a ShadedMaterial whose modifier has no snippet renders as if that
// modifier were absent. Register the built-ins with registerBuiltInGlModifierSnippets.
export function registerGlModifierSnippet(state: GlRenderState, snippet: Readonly<GlModifierSnippet>): void {
  const registries = getGlRenderStateRuntime(state).registries;
  registries.modifierSnippets = withKindMapEntry(registries.modifierSnippets, snippet.kind, snippet);
  registries.modifierSnippetRevision++;
}

// Returns the GL snippet registered for a modifier kind on this state, or null when none is — the
// expected-miss sentinel the compile path checks before injecting an unknown kind.
export function resolveGlModifierSnippet(state: GlRenderState, kind: ModifierKind): GlModifierSnippet | null {
  const entry = getGlRenderStateRuntime(state).registries.modifierSnippets.get(kind);
  return entry ?? null;
}
