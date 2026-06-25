export type Kind = string;
export interface Entity {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
export type EntityWithoutRuntime<Type extends Entity> = Omit<Type, typeof EntityRuntimeKey>;
export interface EntityRuntime {
  binding: object | null;
}
export const EntityRuntimeKey = Symbol.for('EntityRuntime');
