import type { Entity } from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

export function createEntity<Type extends object>(obj?: Type): Type & Entity {
  if (!obj) obj = {} as Type;
  const entity = obj as Type & Entity;
  entity[RuntimeKey] = undefined;
  return entity;
}
