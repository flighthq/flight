import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';

// Open substrate-agnostic base contract for render-effect intents. The kind is both the serialized
// discriminant and the per-backend registry key; concrete effect records remain open to third parties.
export interface Effect extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: Kind;
}
