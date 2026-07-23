import type { ModifierDefinition } from './ModifierDefinition';
import type { ModifierKind } from './ModifierKind';

// An open, last-write-wins registry mapping a `ModifierKind` to its substrate-agnostic definition.
// Not a module global: callers allocate one with `createModifierRegistry`, register built-ins via
// `registerBuiltInModifiers` and their own vendor-prefixed kinds via `registerModifier`, then feed
// it to the composition contract. Unused modifier kinds — and this whole registry — tree-shake out
// for anyone who does not import them, so an assembled variant never costs more than its parts.
export interface ModifierRegistry {
  definitions: Map<ModifierKind, ModifierDefinition>;
}
