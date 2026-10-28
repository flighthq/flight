// Compatibility aggregator: Entity owns its types. Existing consumers can keep importing this
// module while packages migrate to @flighthq/entity/contract.
export { EntityRuntimeKey, EntityRuntimeWriteSlot } from '@flighthq/entity/contract';
export type {
  Entity,
  EntityConstruction,
  EntityRaw,
  EntityRuntime,
  EntityRuntimeWriteExplanation,
  EntityRuntimeWriteGuard,
  EntityWithoutRuntime,
  Kind,
} from '@flighthq/entity/contract';
