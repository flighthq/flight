export type Kind = string;

declare const EntityRawMarker: unique symbol;

// Generated entity records extend this runtime-free marker. Their JavaScript identity is the raw
// object itself; the runtime lives behind entity.ts's package-private symbol and therefore never
// becomes a generated value field.
export interface EntityRaw {
  readonly [EntityRawMarker]?: never;
}

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
