import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

export interface RendererData extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
