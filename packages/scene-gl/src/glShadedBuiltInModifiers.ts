import type { LinearColor } from '@flighthq/color';
import { unpackColorToLinear } from '@flighthq/color';
import { hasImageResourcePixels } from '@flighthq/image';
import { bindGlImageResourceTexture } from '@flighthq/render-gl';
import {
  animatedNormalModifierDefinition,
  dissolveModifierDefinition,
  emissiveModifierDefinition,
  envReflectModifierDefinition,
  fogModifierDefinition,
  rimModifierDefinition,
  toonModifierDefinition,
  vertexDisplaceModifierDefinition,
} from '@flighthq/shading';
import type {
  AnimatedNormalModifier,
  DissolveModifier,
  EmissiveModifier,
  EnvReflectModifier,
  FogModifier,
  GlRenderState,
  Modifier,
  RimModifier,
  Texture,
  ToonModifier,
  VertexDisplaceModifier,
} from '@flighthq/types';
import { EmissiveModifierFacing, FogModifierMode, VertexDisplaceModifierSource } from '@flighthq/types';

import type { GlModifierBindContext, GlModifierSnippet } from './glShadedModifierSnippet';
import { registerGlModifierSnippet } from './glShadedModifierSnippet';

// The built-in GL modifier snippets — the backend halves of @flighthq/shading's eight built-in
// modifier descriptors, across all six slots: VertexDisplace (Vertex), AnimatedNormal (Normal),
// Emissive (Emissive), and Rim/EnvReflect/Fog/Dissolve/Toon (Effect). Each SPREADS the
// substrate-agnostic definition (kind/slot/getDefineSignature owned by @flighthq/shading) and adds
// GLSL (declarations + a slot-hook contribution, names suffixed by the modifier's stack index so
// repeated kinds never collide) plus a per-draw uniform upload. Reusing the framework definition —
// rather than re-deriving the signature here — guarantees the program keyed by a stack's define-key
// always matches the GLSL assembled for it: Emissive `m`/`g`, AnimatedNormal `0`/`1`/`2`, Fog
// `l`/`e`/`x`, Dissolve ``/`m`, VertexDisplace `s`/`h`(+`a`), Rim/EnvReflect/Toon none.

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

// A clip/burn dissolve of the shaded output, discarding fragments below a noise threshold and tinting
// the burn edge. Signature `` (procedural value noise over v_uv0) or `m` (sampled from a noise map).
export const dissolveGlModifierSnippet: GlModifierSnippet = {
  ...dissolveModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const dissolve = modifier as Readonly<DissolveModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    gl.uniform1f(gl.getUniformLocation(context.program, `u_dissolveThreshold${suffix}`), dissolve.threshold);
    gl.uniform1f(gl.getUniformLocation(context.program, `u_dissolveEdgeWidth${suffix}`), dissolve.edgeWidth ?? 0.05);
    unpackColorToLinear(scratchRgba, dissolve.edgeColor);
    gl.uniform3f(
      gl.getUniformLocation(context.program, `u_dissolveEdgeColor${suffix}`),
      scratchRgba[0],
      scratchRgba[1],
      scratchRgba[2],
    );
    if (dissolve.map !== undefined) bindGlModifierTexture(context, dissolve.map, `u_dissolveMap${suffix}`);
    else gl.uniform1f(gl.getUniformLocation(context.program, `u_dissolveScale${suffix}`), dissolve.scale ?? 8);
  },
  contribution(modifier: Readonly<Modifier>, index: number): string {
    const dissolve = modifier as Readonly<DissolveModifier>;
    const suffix = `_${index}`;
    const noise =
      dissolve.map !== undefined
        ? `  float dissolveNoise = texture(u_dissolveMap${suffix}, v_uv0).r;\n`
        : `  float dissolveNoise = shadedValueNoise(v_uv0 * u_dissolveScale${suffix});\n`;
    return (
      `{\n` +
      noise +
      `  if (dissolveNoise < u_dissolveThreshold${suffix}) discard;\n` +
      `  float dissolveEdge = 1.0 - smoothstep(u_dissolveThreshold${suffix}, u_dissolveThreshold${suffix} + max(u_dissolveEdgeWidth${suffix}, 1e-4), dissolveNoise);\n` +
      `  radiance = mix(radiance, u_dissolveEdgeColor${suffix}, dissolveEdge);\n` +
      `}`
    );
  },
  declarations(modifier: Readonly<Modifier>, index: number): string {
    const dissolve = modifier as Readonly<DissolveModifier>;
    const suffix = `_${index}`;
    let source =
      `uniform float u_dissolveThreshold${suffix};\n` +
      `uniform float u_dissolveEdgeWidth${suffix};\n` +
      `uniform vec3 u_dissolveEdgeColor${suffix};\n`;
    source +=
      dissolve.map !== undefined
        ? `uniform sampler2D u_dissolveMap${suffix};\n`
        : `uniform float u_dissolveScale${suffix};\n`;
    return source;
  },
};

// A view-dependent reflection of the scene's baked environment cubemap, Fresnel-blended into the
// shaded radiance. One program shape (all params are uniforms). It samples the SAME prefiltered
// environment (u_iblPrefiltered on the IBL unit) the lit block already binds, so it declares those
// shared uniforms itself — a scene without a baked environment leaves u_iblEnabled at 0 and the term
// falls back to the reflection tint.
export const envReflectGlModifierSnippet: GlModifierSnippet = {
  ...envReflectModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const reflect = modifier as Readonly<EnvReflectModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    unpackColorToLinear(scratchRgba, reflect.tint);
    gl.uniform3f(
      gl.getUniformLocation(context.program, `u_envReflectTint${suffix}`),
      scratchRgba[0],
      scratchRgba[1],
      scratchRgba[2],
    );
    gl.uniform1f(gl.getUniformLocation(context.program, `u_envReflectIntensity${suffix}`), reflect.intensity ?? 1);
    gl.uniform1f(gl.getUniformLocation(context.program, `u_envReflectFresnel${suffix}`), reflect.fresnelBias ?? 0.04);
    gl.uniform1f(gl.getUniformLocation(context.program, `u_envReflectRoughness${suffix}`), reflect.roughness ?? 0);
  },
  contribution(_modifier: Readonly<Modifier>, index: number): string {
    const suffix = `_${index}`;
    return (
      `{\n` +
      `  vec3 envReflectDir = reflect(-viewDir, normal);\n` +
      `  float envReflectMip = clamp(u_envReflectRoughness${suffix}, 0.0, 1.0) * max(u_iblMaxMip, 0.0);\n` +
      `  vec3 envReflectSample = u_iblEnabled > 0.5 ? textureLod(u_iblPrefiltered, envReflectDir, envReflectMip).rgb : u_envReflectTint${suffix};\n` +
      `  float envReflectFresnel = u_envReflectFresnel${suffix} + (1.0 - u_envReflectFresnel${suffix}) * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);\n` +
      `  radiance += envReflectSample * u_envReflectTint${suffix} * (u_envReflectIntensity${suffix} * envReflectFresnel);\n` +
      `}`
    );
  },
  declarations(_modifier: Readonly<Modifier>, index: number): string {
    const suffix = `_${index}`;
    return (
      `uniform samplerCube u_iblPrefiltered;\n` +
      `uniform float u_iblEnabled;\n` +
      `uniform float u_iblMaxMip;\n` +
      `uniform vec3 u_envReflectTint${suffix};\n` +
      `uniform float u_envReflectIntensity${suffix};\n` +
      `uniform float u_envReflectFresnel${suffix};\n` +
      `uniform float u_envReflectRoughness${suffix};\n`
    );
  },
};

// A per-material distance fog blending the shaded output toward a color. Signature `l` (linear
// near/far ramp), `e` (exponential), `x` (exponential-squared) — each emits a different factor.
export const fogGlModifierSnippet: GlModifierSnippet = {
  ...fogModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const fog = modifier as Readonly<FogModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    unpackColorToLinear(scratchRgba, fog.color);
    gl.uniform3f(
      gl.getUniformLocation(context.program, `u_fogColor${suffix}`),
      scratchRgba[0],
      scratchRgba[1],
      scratchRgba[2],
    );
    if (fog.mode === undefined || fog.mode === FogModifierMode.Linear) {
      gl.uniform1f(gl.getUniformLocation(context.program, `u_fogNear${suffix}`), fog.near ?? 0);
      gl.uniform1f(gl.getUniformLocation(context.program, `u_fogFar${suffix}`), fog.far ?? 1);
    } else {
      gl.uniform1f(gl.getUniformLocation(context.program, `u_fogDensity${suffix}`), fog.density ?? 1);
    }
  },
  contribution(modifier: Readonly<Modifier>, index: number): string {
    const fog = modifier as Readonly<FogModifier>;
    const suffix = `_${index}`;
    let factor: string;
    if (fog.mode === FogModifierMode.Exponential) {
      factor = `  float fogFactor = 1.0 - exp(-u_fogDensity${suffix} * fogDist);\n`;
    } else if (fog.mode === FogModifierMode.Exponential2) {
      factor = `  float fogTerm = u_fogDensity${suffix} * fogDist;\n  float fogFactor = 1.0 - exp(-fogTerm * fogTerm);\n`;
    } else {
      factor = `  float fogFactor = clamp((fogDist - u_fogNear${suffix}) / max(u_fogFar${suffix} - u_fogNear${suffix}, 1e-4), 0.0, 1.0);\n`;
    }
    return (
      `{\n` +
      `  float fogDist = length(u_cameraPosition - v_worldPosition);\n` +
      factor +
      `  radiance = mix(radiance, u_fogColor${suffix}, clamp(fogFactor, 0.0, 1.0));\n` +
      `}`
    );
  },
  declarations(modifier: Readonly<Modifier>, index: number): string {
    const fog = modifier as Readonly<FogModifier>;
    const suffix = `_${index}`;
    let source = `uniform vec3 u_fogColor${suffix};\n`;
    source +=
      fog.mode === undefined || fog.mode === FogModifierMode.Linear
        ? `uniform float u_fogNear${suffix};\nuniform float u_fogFar${suffix};\n`
        : `uniform float u_fogDensity${suffix};\n`;
    return source;
  },
};

// Quantizes the shaded radiance into flat cel bands. One program shape (steps/smoothness are
// uniforms).
export const toonGlModifierSnippet: GlModifierSnippet = {
  ...toonModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const toon = modifier as Readonly<ToonModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    gl.uniform1f(gl.getUniformLocation(context.program, `u_toonSteps${suffix}`), Math.max(toon.steps, 2));
    gl.uniform1f(gl.getUniformLocation(context.program, `u_toonSmoothness${suffix}`), toon.smoothness ?? 0);
  },
  contribution(_modifier: Readonly<Modifier>, index: number): string {
    const suffix = `_${index}`;
    return (
      `{\n` +
      `  float toonLum = dot(radiance, vec3(0.2126, 0.7152, 0.0722));\n` +
      `  float toonSteps = max(u_toonSteps${suffix}, 2.0);\n` +
      `  float toonScaled = toonLum * toonSteps;\n` +
      `  float toonBand = floor(toonScaled);\n` +
      `  float toonFrac = toonScaled - toonBand;\n` +
      `  float toonSoft = max(u_toonSmoothness${suffix}, 1e-4);\n` +
      `  float toonQuant = (toonBand + smoothstep(0.5 - toonSoft, 0.5 + toonSoft, toonFrac)) / toonSteps;\n` +
      `  radiance *= toonLum > 1e-4 ? toonQuant / toonLum : 1.0;\n` +
      `}`
    );
  },
  declarations(_modifier: Readonly<Modifier>, index: number): string {
    const suffix = `_${index}`;
    return `uniform float u_toonSteps${suffix};\nuniform float u_toonSmoothness${suffix};\n`;
  },
};

// The one VERTEX-stage snippet: displaces the local vertex along its normal (or a fixed axis) before
// the model transform. Signature `s` (Sine procedural wave, animated by u_time) or `h` (HeightMap red
// channel), optionally `+a` when a fixed push axis replaces the surface normal.
export const vertexDisplaceGlModifierSnippet: GlModifierSnippet = {
  ...vertexDisplaceModifierDefinition,
  bind(modifier: Readonly<Modifier>, context: Readonly<GlModifierBindContext>): void {
    const displace = modifier as Readonly<VertexDisplaceModifier>;
    const gl = context.state.gl;
    const suffix = `_${context.index}`;
    gl.uniform1f(gl.getUniformLocation(context.program, `u_vDisplaceAmplitude${suffix}`), displace.amplitude);
    if (displace.axis !== undefined) {
      gl.uniform3f(
        gl.getUniformLocation(context.program, `u_vDisplaceAxis${suffix}`),
        displace.axis.x,
        displace.axis.y,
        displace.axis.z,
      );
    }
    if (displace.source === VertexDisplaceModifierSource.HeightMap) {
      if (displace.map !== undefined) bindGlModifierTexture(context, displace.map, `u_vDisplaceMap${suffix}`);
    } else {
      gl.uniform1f(gl.getUniformLocation(context.program, `u_vDisplaceFrequency${suffix}`), displace.frequency ?? 1);
      gl.uniform1f(gl.getUniformLocation(context.program, `u_vDisplaceSpeed${suffix}`), displace.speed ?? 1);
      const dir = displace.direction ?? { x: 1, y: 0, z: 0 };
      gl.uniform3f(gl.getUniformLocation(context.program, `u_vDisplaceDir${suffix}`), dir.x, dir.y, dir.z);
    }
  },
  contribution(modifier: Readonly<Modifier>, index: number): string {
    const displace = modifier as Readonly<VertexDisplaceModifier>;
    const suffix = `_${index}`;
    const axis =
      displace.axis !== undefined
        ? `  vec3 vDisplaceAxis = normalize(u_vDisplaceAxis${suffix});\n`
        : `  vec3 vDisplaceAxis = normalize(localNormal);\n`;
    const amount =
      displace.source === VertexDisplaceModifierSource.HeightMap
        ? `  float vDisplaceAmount = texture(u_vDisplaceMap${suffix}, vertexUv).r * u_vDisplaceAmplitude${suffix};\n`
        : `  float vDisplacePhase = dot(localPosition.xyz, normalize(u_vDisplaceDir${suffix})) * u_vDisplaceFrequency${suffix} + u_time * u_vDisplaceSpeed${suffix};\n  float vDisplaceAmount = sin(vDisplacePhase) * u_vDisplaceAmplitude${suffix};\n`;
    return `{\n` + axis + amount + `  localPosition.xyz += vDisplaceAxis * vDisplaceAmount;\n` + `}`;
  },
  declarations(modifier: Readonly<Modifier>, index: number): string {
    const displace = modifier as Readonly<VertexDisplaceModifier>;
    const suffix = `_${index}`;
    let source = `uniform float u_vDisplaceAmplitude${suffix};\n`;
    if (displace.axis !== undefined) source += `uniform vec3 u_vDisplaceAxis${suffix};\n`;
    source +=
      displace.source === VertexDisplaceModifierSource.HeightMap
        ? `uniform sampler2D u_vDisplaceMap${suffix};\n`
        : `uniform float u_vDisplaceFrequency${suffix};\nuniform float u_vDisplaceSpeed${suffix};\nuniform vec3 u_vDisplaceDir${suffix};\n`;
    return source;
  },
};

// Registers the three built-in GL modifier snippets on this state. Opt-in (no top-level side effect)
// and separate from registerShadedGlMaterial so a plain ShadedMaterial pays nothing for modifier
// snippets it does not use — a caller registers this once alongside any vendor-prefixed snippets
// before drawing a ShadedMaterial that carries modifiers.
export function registerBuiltInGlModifierSnippets(state: GlRenderState): void {
  registerGlModifierSnippet(state, animatedNormalGlModifierSnippet);
  registerGlModifierSnippet(state, dissolveGlModifierSnippet);
  registerGlModifierSnippet(state, emissiveGlModifierSnippet);
  registerGlModifierSnippet(state, envReflectGlModifierSnippet);
  registerGlModifierSnippet(state, fogGlModifierSnippet);
  registerGlModifierSnippet(state, rimGlModifierSnippet);
  registerGlModifierSnippet(state, toonGlModifierSnippet);
  registerGlModifierSnippet(state, vertexDisplaceGlModifierSnippet);
}

// Binds a modifier's texture on the next free modifier texture unit and points its sampler uniform at
// it. Mirrors the base material's texture bind (activeTexture → bindGlImageResourceTexture → uniform1i). A texture
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
  if (image !== null && hasImageResourcePixels(image)) {
    bindGlImageResourceTexture(state, image, texture.sampler);
  }
  gl.uniform1i(gl.getUniformLocation(context.program, uniformName), unit);
  gl.activeTexture(gl.TEXTURE0);
}

function isEmissiveGated(modifier: Readonly<EmissiveModifier>): boolean {
  return modifier.facing !== undefined && modifier.facing !== EmissiveModifierFacing.Ignore;
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
