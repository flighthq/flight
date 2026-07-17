import { ModifierSlot } from '@flighthq/types';

// Returns true when `value` is one of the built-in slot names (Diffuse/Specular/Normal/Emissive/
// Effect). A sentinel-returning guard, not a throw: it reports membership in the canonical taxonomy
// so a caller can distinguish a known slot from a reserved (Ambient/Shadow) or vendor-prefixed one.
// Reserved and vendor slots are valid to author but return false here — they are not part of the v1
// built-in set.
export function isModifierSlot(value: string): boolean {
  return BUILT_IN_SLOTS.has(value);
}

const BUILT_IN_SLOTS = new Set<string>([
  ModifierSlot.Diffuse,
  ModifierSlot.Effect,
  ModifierSlot.Emissive,
  ModifierSlot.Normal,
  ModifierSlot.Specular,
]);
