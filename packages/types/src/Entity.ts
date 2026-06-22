// A kind is a plain string identifier: simultaneously the registry key, the serialized form, and
// the user-facing intent vocabulary. See tools/agents/docs/conventions/types-layout.md.
export type Kind = string;

export interface Entity {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export type EntityWithoutRuntime<Type extends Entity> = Omit<Type, typeof EntityRuntimeKey>;

export interface EntityRuntime {
  binding: object | null;
}

export const EntityRuntimeKey: unique symbol = Symbol.for('EntityRuntime');
