export type Kind = string;

// Generated entity records extend this runtime-free structural base. `object` rejects primitives
// without adding a phantom property to `keyof` every Entity-derived record.
export type EntityRaw = object;

export interface EntityRuntime {
  binding: object | null;
  uid?: string;
}

/**
 * @deprecated Import EntityRaw and use the Entity helpers instead. This bridge remains only for
 * existing contract consumers that access the old symbol-keyed runtime slot directly.
 */
export const EntityRuntimeKey = Symbol.for('EntityRuntime');

export type EntityConstruction<Type extends EntityRaw> = { -readonly [Key in keyof Type]: Type[Key] };
export type EntityWithoutRuntime<Type extends EntityRaw> = Omit<Type, typeof EntityRuntimeKey>;

export const EntityRuntimeWriteSlot = {
  BindingSlot: 'binding-slot',
  RuntimeSlot: 'runtime-slot',
} as const;
export type EntityRuntimeWriteSlot = (typeof EntityRuntimeWriteSlot)[keyof typeof EntityRuntimeWriteSlot];

export type EntityRuntimeWriteGuard = (slot: EntityRuntimeWriteSlot) => void;

export interface EntityRuntimeWriteExplanation {
  message: string;
  slot: EntityRuntimeWriteSlot;
  useInstead: readonly string[];
}
