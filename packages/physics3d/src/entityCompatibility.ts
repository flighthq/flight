import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

// The legacy raw-entity contract carries this symbol slot. Keep it internal so construction helpers
// can omit the slot without re-exporting a second Entity contract from Physics3D.
export interface Physics3DEntityCompatibility extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}
