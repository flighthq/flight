import type { GlRenderState } from './GlRenderState';
import type { Modifier } from './Modifier';
import type { ModifierDefinition } from './ModifierDefinition';

// The per-modifier binding context the ShadedMaterial renderer hands each snippet's `bind`. It
// carries the live GL state, the linked ShadedMaterial `program` (for uniform-location lookups by
// the snippet's suffixed names), the modifier's `index` in the ordered stack (the suffix that keeps
// two modifiers of the same kind from colliding on uniform names), and a texture-unit allocator.
// `acquireModifierTextureUnit` hands out successive units above the base material's (diffuse/specular/
// normal on 0/1/2) and below the shadow/IBL units, returning -1 once exhausted so a many-textured
// stack never clobbers a base or shadow binding. The per-frame `time` reaches the shader through the
// renderer's `u_time` uniform (uploaded once while the program is bound), not through this context.
export interface GlModifierBindContext {
  acquireModifierTextureUnit(): number;
  index: number;
  program: WebGLProgram;
  state: GlRenderState;
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
