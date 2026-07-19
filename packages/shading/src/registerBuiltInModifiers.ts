import type {
  AnimatedNormalModifier,
  EmissiveModifier,
  FogModifier,
  Modifier,
  VertexDisplaceModifier,
} from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  DissolveModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  EnvReflectModifierKind,
  FogModifierKind,
  FogModifierMode,
  ModifierSlot,
  RimModifierKind,
  ToonModifierKind,
  VertexDisplaceModifierKind,
  VertexDisplaceModifierSource,
} from '@flighthq/types';

import type { ModifierDefinition, ModifierRegistry } from './modifierRegistry';
import { registerModifier } from './modifierRegistry';

// The substrate-agnostic AnimatedNormal built-in definition (slot: Normal). Its signature keys the
// layer count from map structure — `0` disabled (no map), `1` single-layer, `2` dual-layer
// (secondaryMap present) — the only compile-time-affecting choices; scroll/strength are uniforms.
// A backend snippet reuses this definition (kind/slot/signature) rather than re-deriving it, so the
// framework-computed batch key and the compiled variant can never drift.
export const animatedNormalModifierDefinition: ModifierDefinition = {
  kind: AnimatedNormalModifierKind,
  slot: ModifierSlot.Normal,
  getDefineSignature(modifier: Readonly<Modifier>): string {
    const animated = modifier as Readonly<AnimatedNormalModifier>;
    if (animated.map === null) return '0';
    return animated.secondaryMap !== undefined ? '2' : '1';
  },
};

// The substrate-agnostic Dissolve built-in definition (slot: Effect). Its signature is `m` when a
// mask/noise texture is supplied (a sampled-noise program) and `''` for the procedural-noise variant
// — the one compile-time-affecting choice; threshold/edge width/scale are uniforms.
export const dissolveModifierDefinition: ModifierDefinition = {
  kind: DissolveModifierKind,
  slot: ModifierSlot.Effect,
  getDefineSignature(modifier: Readonly<Modifier>): string {
    return (modifier as { map?: unknown }).map !== undefined ? 'm' : '';
  },
};

// The substrate-agnostic Emissive built-in definition (slot: Emissive). Its signature encodes the
// two compile-time-affecting options — `m` when masked, `g` when facing-gated (facing set and not
// Ignore), combined `mg` — never the uniform-fed color/strength. Shared by every backend snippet so
// the batch key and the compiled program variant stay single-sourced.
export const emissiveModifierDefinition: ModifierDefinition = {
  kind: EmissiveModifierKind,
  slot: ModifierSlot.Emissive,
  getDefineSignature(modifier: Readonly<Modifier>): string {
    const emissive = modifier as Readonly<EmissiveModifier>;
    let signature = '';
    if (emissive.mask !== undefined) signature += 'm';
    if (emissive.facing !== undefined && emissive.facing !== EmissiveModifierFacing.Ignore) signature += 'g';
    return signature;
  },
};

// The substrate-agnostic EnvReflect built-in definition (slot: Effect). One program shape, so no
// signature — tint/intensity/fresnelBias/roughness are all uniforms and never split a variant. It
// samples the shared baked environment cubemap the lit block already binds.
export const envReflectModifierDefinition: ModifierDefinition = {
  kind: EnvReflectModifierKind,
  slot: ModifierSlot.Effect,
};

// The substrate-agnostic Fog built-in definition (slot: Effect). Its signature is the distance-curve
// mode — `l` Linear, `e` Exponential, `x` Exponential2 — the only compile-time-affecting choice; the
// near/far/density scalars and color are uniforms.
export const fogModifierDefinition: ModifierDefinition = {
  kind: FogModifierKind,
  slot: ModifierSlot.Effect,
  getDefineSignature(modifier: Readonly<Modifier>): string {
    const fog = modifier as Readonly<FogModifier>;
    if (fog.mode === FogModifierMode.Exponential) return 'e';
    if (fog.mode === FogModifierMode.Exponential2) return 'x';
    return 'l';
  },
};

// Registers the eight built-in modifiers into `registry` with their slots and define-key signatures
// (the eight exported built-in definitions). Not called at module load (packages are import
// side-effect-free); a caller opts in once, alongside any vendor-prefixed kinds, before composing.
// Last-write-wins, so calling it after a custom override re-installs the built-ins.
export function registerBuiltInModifiers(registry: Readonly<ModifierRegistry>): void {
  registerModifier(registry, animatedNormalModifierDefinition);
  registerModifier(registry, dissolveModifierDefinition);
  registerModifier(registry, emissiveModifierDefinition);
  registerModifier(registry, envReflectModifierDefinition);
  registerModifier(registry, fogModifierDefinition);
  registerModifier(registry, rimModifierDefinition);
  registerModifier(registry, toonModifierDefinition);
  registerModifier(registry, vertexDisplaceModifierDefinition);
}

// The substrate-agnostic Rim built-in definition (slot: Effect). One program shape, so no signature —
// power/intensity/bias are all uniforms and never split a variant.
export const rimModifierDefinition: ModifierDefinition = {
  kind: RimModifierKind,
  slot: ModifierSlot.Effect,
};

// The substrate-agnostic Toon built-in definition (slot: Effect). One program shape, so no signature —
// steps/smoothness are uniforms and never split a variant.
export const toonModifierDefinition: ModifierDefinition = {
  kind: ToonModifierKind,
  slot: ModifierSlot.Effect,
};

// The substrate-agnostic VertexDisplace built-in definition (slot: Vertex — the one vertex-stage
// built-in). Its signature keys the two compile-time-affecting choices: the noise `source` (`s` Sine,
// `h` HeightMap) and whether a fixed `axis` replaces the surface-normal push (`+a`); amplitude/
// frequency/speed/direction are uniforms.
export const vertexDisplaceModifierDefinition: ModifierDefinition = {
  kind: VertexDisplaceModifierKind,
  slot: ModifierSlot.Vertex,
  getDefineSignature(modifier: Readonly<Modifier>): string {
    const displace = modifier as Readonly<VertexDisplaceModifier>;
    let signature = displace.source === VertexDisplaceModifierSource.HeightMap ? 'h' : 's';
    if (displace.axis !== undefined) signature += 'a';
    return signature;
  },
};
