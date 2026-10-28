// Compatibility aggregator: Entity owns its types. Existing consumers can keep importing this
// module while packages migrate to @flighthq/entity/contract.
export { EntityRuntimeKey, EntityRuntimeWriteSlot } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';

export type {
  EntityConstruction,
  EntityRaw,
  EntityRuntime,
  EntityRuntimeWriteExplanation,
  EntityRuntimeWriteGuard,
  EntityWithoutRuntime,
  Kind,
} from '@flighthq/entity/contract';

/** @deprecated Import EntityRaw and use package-owned raw contracts instead. */
export interface Entity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
