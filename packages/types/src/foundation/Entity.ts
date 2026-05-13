import type { Runtime, RuntimeKey } from './Runtime';

export interface Entity {
  [RuntimeKey]: Runtime | undefined;
}

export type EntityWithoutRuntime<Type extends Entity> = Omit<Type, typeof RuntimeKey>;
