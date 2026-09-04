import type { Entity, EntityConstruction } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function allocateEntity<Type extends Entity>(): EntityConstruction<Type> {
  const out = {} as EntityConstruction<Type>;
  out[EntityRuntimeKey] = undefined;
  return out;
}

export function finishEntity<Type extends Entity>(out: EntityConstruction<Type>): Type {
  return out as Type;
}
