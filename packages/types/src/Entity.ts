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
// slot. Reported by @flighthq/entity's guard proxies through `setEntityRuntimeWriteGuard`; a null guard is
// the production default. `enableEntityRuntimeGuards` installs a reporter the CALLER supplies, so the
// choice of sink stays outside core.
export type EntityRuntimeWriteSlot = 'binding-slot' | 'runtime-slot';

export type EntityRuntimeWriteGuard = (slot: EntityRuntimeWriteSlot) => void;

// What a guarded direct write means, as plain data rather than a rendered message: `message` states what
// happened and what it costs, and `useInstead` names the functions that keep the runtime and the binding
// consistent. Returned by `explainEntityRuntimeWrite` so a caller's reporter can phrase the warning
// without core owning a logger.
export interface EntityRuntimeWriteExplanation {
  message: string;
  slot: EntityRuntimeWriteSlot;
  useInstead: readonly string[];
}
