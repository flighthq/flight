import { createModifierRegistry, registerModifier, resolveModifier } from '@flighthq/shading';
import type { GlModifierSnippet, GlRenderState, ModifierKind } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
// Registers (or replaces) the GL snippet for a modifier kind on this state's scene runtime. Opt-in
// and last-write-wins (a vendor-prefixed kind, or an override of a built-in, wins). Unregistered
// kinds contribute no GLSL, so a ShadedMaterial whose modifier has no snippet renders as if that
// modifier were absent. Register the three built-ins with registerBuiltInGlModifierSnippets. Lazily
// allocates the modifier registry on first use so a PBR/classic-only scene-gl consumer that never
// registers a snippet pays nothing for the shading tier.
export function registerGlModifierSnippet(state: GlRenderState, snippet: Readonly<GlModifierSnippet>): void {
  const runtime = getGlSceneRuntime(state);
  if (runtime.modifierSnippetRegistry === null) runtime.modifierSnippetRegistry = createModifierRegistry();
  registerModifier(runtime.modifierSnippetRegistry, snippet);
}

// Returns the GL snippet registered for a modifier kind on this state, or null when none is (including
// when no snippet has ever been registered, so the registry is still unallocated) — the expected-miss
// sentinel the compile path checks before injecting an unknown kind.
export function resolveGlModifierSnippet(state: GlRenderState, kind: ModifierKind): GlModifierSnippet | null {
  const registry = getGlSceneRuntime(state).modifierSnippetRegistry;
  if (registry === null) return null;
  return resolveModifier(registry, kind) as GlModifierSnippet | null;
}
