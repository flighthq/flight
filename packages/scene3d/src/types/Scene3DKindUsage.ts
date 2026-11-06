import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { TextureSourceKind } from '@flighthq/texture/contract';

interface Scene3DKindUsageEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

// The sorted, deduplicated kinds and resource formats present in a Scene3D.
export interface Scene3DKindUsage extends Scene3DKindUsageEntity {
  materialKinds: Kind[];
  modifierKinds: Kind[];
  nodeKinds: Kind[];
  resourceMimeTypes: string[];
  textureSourceKinds: TextureSourceKind[];
}
