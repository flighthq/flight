import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { bindGlTexture } from '@flighthq/render-gl';
import { animatedNormalModifierDefinition, emissiveModifierDefinition, rimModifierDefinition } from '@flighthq/shading';
import type {
  AnimatedNormalModifier,
  EmissiveModifier,
  GlRenderState,
  Modifier,
  RimModifier,
  Texture,
} from '@flighthq/types';
import { EmissiveModifierFacing } from '@flighthq/types';

import type { GlModifierBindContext, GlModifierSnippet } from './glShadedModifierSnippet';
import { registerGlModifierSnippet } from './glShadedModifierSnippet';

// The three v1 seed GL modifier snippets — AnimatedNormal (Normal slot), Emissive (Emissive slot),
// and Rim (Effect slot) — the backend halves of @flighthq/shading's three built-in modifier
// descriptors. Each SPREADS the substrate-agnostic definition (kind/slot/getDefineSignature owned by
// @flighthq/shading) and adds GLSL (declarations + a slot-hook contribution, names suffixed by the
// modifier's stack index so repeated kinds never collide) plus a per-draw uniform upload. Reusing the
// framework definition — rather than re-deriving the signature here — guarantees the program keyed by
// a stack's define-key always matches the GLSL assembled for it: Emissive `m`/`g`, AnimatedNormal
// `0`/`1`/`2`, Rim none.

// A UV-panned normal map perturbing the shading normal, scrolled by u_time. Signature `0` (no map,
// no GLSL), `1` single-layer, `2` dual-layer.
export const animatedNormalGlModifierSnippet: GlModifierSnippet = {
  ...animatedNormalModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const animated = modifier as Readonly<AnimatedNormalModifier>;
    if (animated.map === null) return;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    bindGlModifierTexture(context, animated.map, `u_animNormalMap${suffix}`);
    const scroll = animated.scroll;
    gl.uniform2f(gl.getUniformLocation(context.program, `u_animNormalScroll${suffix}`), scroll.x, scroll.y);
    gl.uniform1f(gl.getUniformLocation(context.program, `u_animNormalStrength${suffix}`), animated.strength ?? 1);
    if (animated.secondaryMap !== undefined) {
      bindGlModifierTexture(context, animated.secondaryMap, `u_animNormalMap2${suffix}`);
      const secondary = animated.secondaryScroll ?? scroll;
      gl.uniform2f(gl.getUniformLocation(context.program, `u_animNormalScroll2${suffix}`), secondary.x, secondary.y);
    }
  },
  contribution(modifier: Readonly<Modifier>, index: number): string {
    const animated = modifier as Readonly<AnimatedNormalModifier>;
    if (animated.map === null) return '';
    const suffix = `_${index}`;
    const dual =
      animated.secondaryMap !== undefined
        ? `  animNormal += texture(u_animNormalMap2${suffix}, v_uv0 + u_animNormalScroll2${suffix} * u_time).xyz * 2.0 - 1.0;\n`
        : '';
    return (
      `{\n` +
      `  vec3 animNormal = texture(u_animNormalMap${suffix}, v_uv0 + u_animNormalScroll${suffix} * u_time).xyz * 2.0 - 1.0;\n` +
      dual +
      `  animNormal.xy *= u_animNormalStrength${suffix};\n` +
      `  normal = normalize(tbn * animNormal);\n` +
      `}`
    );
  },
  declarations(modifier: Readonly<Modifier>, index: number): string {
    const animated = modifier as Readonly<AnimatedNormalModifier>;
    if (animated.map === null) return '';
    const suffix = `_${index}`;
    let source =
      `uniform sampler2D u_animNormalMap${suffix};\n` +
      `uniform vec2 u_animNormalScroll${suffix};\n` +
      `uniform float u_animNormalStrength${suffix};\n`;
    if (animated.secondaryMap !== undefined) {
      source += `uniform sampler2D u_animNormalMap2${suffix};\nuniform vec2 u_animNormalScroll2${suffix};\n`;
    }
    return source;
  },
};

// A self-illuminating contribution added to the shaded radiance, optionally masked and optionally
// gated by surface facing (the night-side city-lights case). Signature `m` (masked), `g` (facing
// gate), combined `mg`.
export const emissiveGlModifierSnippet: GlModifierSnippet = {
  ...emissiveModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const emissive = modifier as Readonly<EmissiveModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    unpackColorToLinear(scratchRgba, emissive.color);
    gl.uniform3f(
      gl.getUniformLocation(context.program, `u_emissiveColor${suffix}`),
      scratchRgba[0],
      scratchRgba[1],
      scratchRgba[2],
    );
    gl.uniform1f(gl.getUniformLocation(context.program, `u_emissiveStrength${suffix}`), emissive.strength);
    if (emissive.mask !== undefined) bindGlModifierTexture(context, emissive.mask, `u_emissiveMask${suffix}`);
    if (isEmissiveGated(emissive)) {
      const sign = emissive.facing === EmissiveModifierFacing.AwayFromLight ? -1 : 1;
      gl.uniform1f(gl.getUniformLocation(context.program, `u_emissiveFacingSign${suffix}`), sign);
      gl.uniform1f(
        gl.getUniformLocation(context.program, `u_emissiveFacingSoftness${suffix}`),
        emissive.facingSoftness ?? 0,
      );
    }
  },
  contribution(modifier: Readonly<Modifier>, index: number): string {
    const emissive = modifier as Readonly<EmissiveModifier>;
    const suffix = `_${index}`;
    let body = `{\n` + `  vec3 emissiveTerm = u_emissiveColor${suffix} * u_emissiveStrength${suffix};\n`;
    if (emissive.mask !== undefined) body += `  emissiveTerm *= texture(u_emissiveMask${suffix}, v_uv0).rgb;\n`;
    if (isEmissiveGated(emissive)) {
      body +=
        `  vec3 emissiveLightDir = u_directionalCount > 0.5 ? normalize(-u_directional.xyz) : vec3(0.0, 0.0, 1.0);\n` +
        `  float emissiveFacing = dot(normal, emissiveLightDir) * u_emissiveFacingSign${suffix};\n` +
        `  float emissiveSoft = max(u_emissiveFacingSoftness${suffix}, 1e-4);\n` +
        `  emissiveTerm *= smoothstep(-emissiveSoft, emissiveSoft, emissiveFacing);\n`;
    }
    body += `  emissive += emissiveTerm;\n}`;
    return body;
  },
  declarations(modifier: Readonly<Modifier>, index: number): string {
    const emissive = modifier as Readonly<EmissiveModifier>;
    const suffix = `_${index}`;
    let source = `uniform vec3 u_emissiveColor${suffix};\nuniform float u_emissiveStrength${suffix};\n`;
    if (emissive.mask !== undefined) source += `uniform sampler2D u_emissiveMask${suffix};\n`;
    if (isEmissiveGated(emissive)) {
      source += `uniform float u_emissiveFacingSign${suffix};\nuniform float u_emissiveFacingSoftness${suffix};\n`;
    }
    return source;
  },
};

// A view-dependent Fresnel rim added to the shaded radiance at grazing angles. One program shape (no
// signature — power/intensity/bias are uniforms).
export const rimGlModifierSnippet: GlModifierSnippet = {
  ...rimModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const rim = modifier as Readonly<RimModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    unpackColorToLinear(scratchRgba, rim.color);
    gl.uniform3f(
      gl.getUniformLocation(context.program, `u_rimColor${suffix}`),
      scratchRgba[0],
      scratchRgba[1],
      scratchRgba[2],
    );
    gl.uniform1f(gl.getUniformLocation(context.program, `u_rimPower${suffix}`), rim.power ?? 3);
    gl.uniform1f(gl.getUniformLocation(context.program, `u_rimIntensity${suffix}`), rim.intensity ?? 1);
    gl.uniform1f(gl.getUniformLocation(context.program, `u_rimBias${suffix}`), rim.bias ?? 0);
  },
  contribution(_modifier: Readonly<Modifier>, index: number): string {
    const suffix = `_${index}`;
    return (
      `{\n` +
      `  float rim = clamp(u_rimBias${suffix} + u_rimIntensity${suffix} * pow(1.0 - max(dot(normal, viewDir), 0.0), max(u_rimPower${suffix}, 0.0001)), 0.0, 1.0);\n` +
      `  radiance += u_rimColor${suffix} * rim;\n` +
      `}`
    );
  },
  declarations(_modifier: Readonly<Modifier>, index: number): string {
    const suffix = `_${index}`;
    return (
      `uniform vec3 u_rimColor${suffix};\n` +
      `uniform float u_rimPower${suffix};\n` +
      `uniform float u_rimIntensity${suffix};\n` +
      `uniform float u_rimBias${suffix};\n`
    );
  },
};

// Registers the three built-in GL modifier snippets on this state. Opt-in (no top-level side effect)
// and separate from registerShadedGlMaterial so a plain ShadedMaterial pays nothing for modifier
// snippets it does not use — a caller registers this once alongside any vendor-prefixed snippets
// before drawing a ShadedMaterial that carries modifiers.
export function registerBuiltInGlModifierSnippets(state: GlRenderState): void {
  registerGlModifierSnippet(state, animatedNormalGlModifierSnippet);
  registerGlModifierSnippet(state, emissiveGlModifierSnippet);
  registerGlModifierSnippet(state, rimGlModifierSnippet);
}

// Binds a modifier's texture on the next free modifier texture unit and points its sampler uniform at
// it. Mirrors the base material's texture bind (activeTexture → bindGlTexture → uniform1i). A texture
// with no loaded source leaves the sampler on that unit without an upload (the modifier renders as if
// unmapped) rather than clobbering a base or shadow unit. When the allocator is exhausted (returns
// -1), the sampler is left untouched — the excess modifier texture is dropped rather than binding
// onto the shadow/IBL units.
function bindGlModifierTexture(
  context: Readonly<GlModifierBindContext>,
  texture: Readonly<Texture>,
  uniformName: string,
): void {
  const state: GlRenderState = context.state;
  const gl = state.gl;
  const unit = context.acquireModifierTextureUnit();
  if (unit < 0) return;
  gl.activeTexture(gl.TEXTURE0 + unit);
  const image = texture.image;
  if (image !== null && image.source !== null) bindGlTexture(state, image.source);
  gl.uniform1i(gl.getUniformLocation(context.program, uniformName), unit);
  gl.activeTexture(gl.TEXTURE0);
}

function isEmissiveGated(modifier: Readonly<EmissiveModifier>): boolean {
  return modifier.facing !== undefined && modifier.facing !== EmissiveModifierFacing.Ignore;
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
