export type Kind = string;

// Generated entity records extend this runtime-free structural base. `object` rejects primitives
// without adding a phantom property to `keyof` every Entity-derived record.
export type EntityRaw = object;

export interface EntityRuntime {
  binding: object | null;
  uid?: string;
}

/**
 * Classifies a repository-owned `create*` result that is intentionally outside the Entity population.
 *
 * RETIRED as a standard, retained only until its remaining uses are migrated. Do not add new uses.
 * This wrapper has no runtime representation and does not change `Type`; the reason remains beside
 * the public API so the Entity contract analyzer can distinguish descriptors from Entity results.
 */
export type NonEntityCreateResult<Type, Kind extends 'descriptor' | 'options' | 'type-only'> = Kind extends
  | 'descriptor'
  | 'options'
  | 'type-only'
  ? Type
  : never;

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
