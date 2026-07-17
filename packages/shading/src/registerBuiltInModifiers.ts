import type { AnimatedNormalModifier, EmissiveModifier, Modifier } from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  ModifierSlot,
  RimModifierKind,
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

// Registers the three v1 seed modifiers — Emissive, Rim, and AnimatedNormal — into `registry` with
// their slots and define-key signatures (the three exported built-in definitions). Not called at
// module load (packages are import side-effect-free); a caller opts in once, alongside any
// vendor-prefixed kinds, before composing. Last-write-wins, so calling it after a custom override
// re-installs the built-ins.
export function registerBuiltInModifiers(registry: Readonly<ModifierRegistry>): void {
  registerModifier(registry, emissiveModifierDefinition);
  registerModifier(registry, rimModifierDefinition);
  registerModifier(registry, animatedNormalModifierDefinition);
}

// The substrate-agnostic Rim built-in definition (slot: Effect). One program shape, so no signature —
// power/intensity/bias are all uniforms and never split a variant.
export const rimModifierDefinition: ModifierDefinition = {
  kind: RimModifierKind,
  slot: ModifierSlot.Effect,
};
