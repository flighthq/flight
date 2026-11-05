import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

export interface GuiEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
