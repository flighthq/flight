import type { AnimatedNormalModifier, EmissiveModifier, Modifier } from '@flighthq/types';
import {
  AnimatedNormalModifierKind,
  EmissiveModifierFacing,
  EmissiveModifierKind,
  ModifierSlot,
  RimModifierKind,
} from '@flighthq/types';

import type { ModifierRegistry } from './modifierRegistry';
import { registerModifier } from './modifierRegistry';

// Registers the three v1 seed modifiers — Emissive, Rim, and AnimatedNormal — into `registry` with
// their slots and define-key signatures. Not called at module load (packages are import
// side-effect-free); a caller opts in once, alongside any vendor-prefixed kinds, before composing.
// Last-write-wins, so calling it after a custom override re-installs the built-ins.
//
// The signatures encode only the COMPILE-TIME structure of each descriptor (which optional,
// program-shaping features are present), never uniform-fed scalars:
//   - Emissive: `m` when masked, `g` when facing-gated (facing !== Ignore); e.g. `mg`, `m`, `g`, ``.
//   - AnimatedNormal: `0` when disabled (no map), `1` single-layer, `2` dual-layer (secondaryMap).
//   - Rim: no signature — a single program shape (power/intensity/bias are uniforms).
export function registerBuiltInModifiers(registry: Readonly<ModifierRegistry>): void {
  registerModifier(registry, {
    kind: EmissiveModifierKind,
    slot: ModifierSlot.Emissive,
    getDefineSignature: getEmissiveModifierDefineSignature,
  });
  registerModifier(registry, {
    kind: RimModifierKind,
    slot: ModifierSlot.Effect,
  });
  registerModifier(registry, {
    kind: AnimatedNormalModifierKind,
    slot: ModifierSlot.Normal,
    getDefineSignature: getAnimatedNormalModifierDefineSignature,
  });
}

function getAnimatedNormalModifierDefineSignature(modifier: Readonly<Modifier>): string {
  const animated = modifier as Readonly<AnimatedNormalModifier>;
  if (animated.map === null) return '0';
  return animated.secondaryMap !== undefined ? '2' : '1';
}

function getEmissiveModifierDefineSignature(modifier: Readonly<Modifier>): string {
  const emissive = modifier as Readonly<EmissiveModifier>;
  let signature = '';
  if (emissive.mask !== undefined) signature += 'm';
  if (emissive.facing !== undefined && emissive.facing !== EmissiveModifierFacing.Ignore) signature += 'g';
  return signature;
}
