import { ModifierSlot } from '@flighthq/types';

// Returns true when `value` is one of the built-in slot names (Vertex/Normal/Diffuse/Specular/
// Emissive/Effect). A sentinel-returning guard, not a throw: it reports membership in the canonical
// built-in taxonomy so a caller can distinguish a known built-in slot from a reserved (Ambient/Shadow)
// or vendor-prefixed one. `ModifierSlot` is an open family (reserved and vendor slots are valid to
// author), so this predicate is deliberately about BUILT-IN membership, not slot-hood in general.
export function isBuiltInModifierSlot(value: string): boolean {
  return BUILT_IN_SLOTS.has(value);
}

const BUILT_IN_SLOTS = new Set<string>([
  ModifierSlot.Diffuse,
  ModifierSlot.Effect,
  ModifierSlot.Emissive,
  ModifierSlot.Normal,
  ModifierSlot.Specular,
  ModifierSlot.Vertex,
]);
