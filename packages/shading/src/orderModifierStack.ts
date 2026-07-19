import type { Modifier } from '@flighthq/types';
import { ModifierSlot } from '@flighthq/types';

// Orders a modifier stack into the deterministic feature-set the compile path assembles: modifiers
// are grouped by the canonical slot pipeline order (Vertex deforms the geometry first, then Normal
// perturbs the normal before lighting, then Diffuse/Specular contribute at shading, then Emissive
// adds, then Effect runs last on the shaded output), and within one slot the caller's authoring order
// is preserved. Because the result depends
// only on the SET of modifiers and their per-slot order — never on cross-slot authoring order — two
// stacks with the same features produce the same feature-set and therefore the same define-key, so
// they batch together. Reserved and vendor-prefixed slots outside the built-in taxonomy sort after
// the known slots, in stable authoring order.
//
// Allocates a new array (a compile-time composition step, not a hot-loop write); the input stack is
// not mutated.
export function orderModifierStack(stack: readonly Modifier[]): readonly Modifier[] {
  const indexed = stack.map((modifier, index) => ({ index, modifier }));
  indexed.sort((a, b) => {
    const rankDelta = getModifierSlotRank(a.modifier.slot) - getModifierSlotRank(b.modifier.slot);
    return rankDelta !== 0 ? rankDelta : a.index - b.index;
  });
  return indexed.map((entry) => entry.modifier);
}

// The canonical slot pipeline rank. Unknown slots (reserved Ambient/Shadow, vendor-prefixed) sort
// after every built-in slot while staying stable relative to one another via the index tie-break.
function getModifierSlotRank(slot: ModifierSlot): number {
  const rank = SLOT_RANK.get(slot);
  return rank !== undefined ? rank : SLOT_RANK.size;
}

const SLOT_RANK = new Map<ModifierSlot, number>([
  [ModifierSlot.Vertex, 0],
  [ModifierSlot.Normal, 1],
  [ModifierSlot.Diffuse, 2],
  [ModifierSlot.Specular, 3],
  [ModifierSlot.Emissive, 4],
  [ModifierSlot.Effect, 5],
]);
