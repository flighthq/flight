import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

/** Structural entity contract retained while the compatibility runtime key remains public. */
export interface InteractionEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
