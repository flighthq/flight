import type { Modifier, ModifierKind, ModifierSlot } from '@flighthq/types';

// The substrate-agnostic registration record for one modifier kind: where it injects (`slot`) and
// how its descriptor's compile-time structure contributes to the define-key (`getDefineSignature`).
// It carries NO backend GLSL — per-backend compilers (e.g. @flighthq/scene-gl) register their own
// snippet against the same `kind` in a backend-side registry. This tier only owns the composition
// contract: slot ordering and the stable define-key that keys the compiled variant cache.
//
// `getDefineSignature` returns a short token naming which OPTIONAL, compile-time-affecting features
// of a modifier instance are structurally present (a mask texture, a facing gate, a second normal
// layer) — the things that change the emitted program, not the uniform-fed scalars (color, strength)
// that leave the program identical. It is a pure function of descriptor structure so the define-key
// is deterministic; omit it (or return `''`) when a kind has exactly one program shape.
export interface ModifierDefinition {
  kind: ModifierKind;
  slot: ModifierSlot;
  getDefineSignature?: (modifier: Readonly<Modifier>) => string;
}

// An open, last-write-wins registry mapping a `ModifierKind` to its substrate-agnostic definition.
// Not a module global: callers allocate one with `createModifierRegistry`, register built-ins via
// `registerBuiltInModifiers` and their own vendor-prefixed kinds via `registerModifier`, then feed
// it to the composition contract. Unused modifier kinds — and this whole registry — tree-shake out
// for anyone who does not import them, so an assembled variant never costs more than its parts.
export interface ModifierRegistry {
  definitions: Map<ModifierKind, ModifierDefinition>;
}

// Allocates an empty modifier registry. The only allocating registry function; register and resolve
// read or mutate an existing registry in place.
export function createModifierRegistry(): ModifierRegistry {
  return { definitions: new Map() };
}

// Registers (or replaces) the definition for `definition.kind`. Last-write-wins: a later
// registration of the same kind overrides the earlier one, so a user can shadow a built-in with a
// vendor-prefixed override. Kind collisions are avoided by the vendor-prefix convention (bare names
// reserved for built-ins), not by a guard here.
export function registerModifier(registry: Readonly<ModifierRegistry>, definition: Readonly<ModifierDefinition>): void {
  registry.definitions.set(definition.kind, definition);
}

// Returns the registered definition for `kind`, or `null` when no definition is registered — the
// expected-miss sentinel a caller checks before composing an unknown kind.
export function resolveModifier(registry: Readonly<ModifierRegistry>, kind: ModifierKind): ModifierDefinition | null {
  return registry.definitions.get(kind) ?? null;
}
