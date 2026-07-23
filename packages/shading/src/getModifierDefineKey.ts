import type { Modifier } from '@flighthq/types';
import type { ModifierRegistry } from '@flighthq/types';

import { resolveModifier } from './modifierRegistry';
import { orderModifierStack } from './orderModifierStack';

// Produces the stable define-key for a modifier stack — the string the compile path caches compiled
// programs by, and the key that makes two materials with the same feature-set share one variant (and
// therefore batch). Two properties hold: it is INDEPENDENT of cross-slot authoring order (the stack
// is canonicalized via `orderModifierStack` first), and it captures every COMPILE-TIME variant of
// each modifier while ignoring uniform-fed values (color/strength change the key not at all). The
// latter comes from the registry: each modifier's registered `getDefineSignature` returns a token
// naming which optional, program-shaping features are present (a mask, a facing gate, a second
// layer), so an emissive-with-mask and a plain emissive get distinct keys and never collide in the
// program cache.
//
// Format: the ordered modifiers joined by `+`, each rendered as `<kind>` or `<kind>:<signature>`
// when its signature is non-empty — e.g. `AnimatedNormalModifier:1+EmissiveModifier:mg+RimModifier`.
// An empty stack yields `''` (the bare base program). Without a `registry`, or for a kind with no
// registered signature, the token is the bare `<kind>` (a coarser key that still distinguishes
// feature sets by kind, but not by per-kind compile-time variant — pass the registry for precision).
export function getModifierDefineKey(stack: readonly Modifier[], registry?: Readonly<ModifierRegistry>): string {
  const ordered = orderModifierStack(stack);
  let key = '';
  for (const modifier of ordered) {
    const signature = getDefineSignature(modifier, registry);
    const token = signature.length > 0 ? `${modifier.kind}:${signature}` : modifier.kind;
    key = key.length > 0 ? `${key}+${token}` : token;
  }
  return key;
}

function getDefineSignature(modifier: Readonly<Modifier>, registry?: Readonly<ModifierRegistry>): string {
  if (registry === undefined) return '';
  const definition = resolveModifier(registry, modifier.kind);
  if (definition === null || definition.getDefineSignature === undefined) return '';
  return definition.getDefineSignature(modifier);
}
