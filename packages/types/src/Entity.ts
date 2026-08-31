export type Kind = string;
export interface Entity {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
export type EntityWithoutRuntime<Type extends Entity> = Omit<Type, typeof EntityRuntimeKey>;
export interface EntityRuntime {
  binding: object | null;
  uid?: string;
}
export const EntityRuntimeKey = Symbol.for('EntityRuntime');

// Which slot a guarded direct write landed on: the entity's runtime slot, or an EntityRuntime's binding
// slot. Reported by @flighthq/entity's guard proxies through `setEntityRuntimeWriteGuard`, and turned into
// a warning by `enableEntityRuntimeGuards`; a null slot is the production default.
export type EntityRuntimeWriteSlot = 'binding-slot' | 'runtime-slot';

export type EntityRuntimeWriteGuard = (slot: EntityRuntimeWriteSlot) => void;
