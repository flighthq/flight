import type { Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createEntity<Type extends object>(obj?: Type): Type & Entity {
  if (!obj) obj = {} as Type;
  const entity = obj as Type & Entity;
  entity[EntityRuntimeKey] = undefined;
  return entity;
}
