import type { Kind } from '@flighthq/entity/contract';
import type { BlendMode } from '@flighthq/materials/contract';
export interface Scene2DKindUsage {
  blendModes: BlendMode[];
  materialKinds: Kind[];
  nodeKinds: Kind[];
  shapeCommandKeys: string[];
}
