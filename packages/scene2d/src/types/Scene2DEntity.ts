import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

export interface Scene2DEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
