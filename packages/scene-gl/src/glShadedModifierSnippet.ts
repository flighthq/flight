import { registerModifier, resolveModifier } from '@flighthq/shading';
import type { ModifierDefinition } from '@flighthq/shading';
import type { GlRenderState, Modifier, ModifierKind } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';

// The per-modifier binding context the ShadedMaterial renderer hands each snippet's `bind`. It
// carries the live GL state, the linked ShadedMaterial `program` (for uniform-location lookups by
// the snippet's suffixed names), the modifier's `index` in the ordered stack (the suffix that keeps
// two modifiers of the same kind from colliding on uniform names), the per-frame `time` value, and a
// texture-unit allocator. `acquireModifierTextureUnit` hands out successive units above the base
// material's (diffuse/specular/normal on 0/1/2) and below the shadow/IBL units, so a modifier that
// samples a map never clobbers a base or shadow binding.
export interface GlModifierBindContext {
  acquireModifierTextureUnit(): number;
  index: number;
  program: WebGLProgram;
  state: GlRenderState;
  time: number;
}

// The backend-side (GL) registration record for one modifier kind: the GLSL a ShadedMaterial program
// injects for it plus how its uniforms upload each draw. It EXTENDS the substrate-agnostic
// ModifierDefinition (kind/slot/getDefineSignature) so one registry both computes the framework
// define-key AND assembles GLSL — the composition contract stays owned by @flighthq/shading; only the
// GLSL and the upload live here.
//
// `declarations` returns the top-level GLSL (uniforms, helper functions) injected once per modifier,
// with every name suffixed by `index` so repeated kinds never collide. `contribution` returns the
// statements injected at the modifier's slot hook (see glShadedPrelude for the variables each slot
// exposes). Both are pure string functions of the descriptor's compile-time structure — the same
// descriptor structure must always yield the same source, which is what makes caching by define-key
// sound. `bind` uploads the modifier's uniforms for one draw; omit it for a modifier with no
// uniforms.
export interface GlModifierSnippet extends ModifierDefinition {
  bind?(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void;
  contribution(modifier: Readonly<Modifier>, index: number): string;
  declarations?(modifier: Readonly<Modifier>, index: number): string;
}

// Registers (or replaces) the GL snippet for a modifier kind on this state's scene runtime. Opt-in
// and last-write-wins (a vendor-prefixed kind, or an override of a built-in, wins). Unregistered
// kinds contribute no GLSL, so a ShadedMaterial whose modifier has no snippet renders as if that
// modifier were absent. Register the three built-ins with registerBuiltInGlModifierSnippets.
export function registerGlModifierSnippet(state: GlRenderState, snippet: Readonly<GlModifierSnippet>): void {
  registerModifier(getGlSceneRuntime(state).modifierSnippetRegistry, snippet);
}

// Returns the GL snippet registered for a modifier kind on this state, or null when none is — the
// expected-miss sentinel the compile path checks before injecting an unknown kind.
export function resolveGlModifierSnippet(state: GlRenderState, kind: ModifierKind): GlModifierSnippet | null {
  return resolveModifier(getGlSceneRuntime(state).modifierSnippetRegistry, kind) as GlModifierSnippet | null;
}
