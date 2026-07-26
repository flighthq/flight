import { createEntity } from '@flighthq/entity/contract';
import type { StandardMaterial } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

export function createStandardMaterial(options?: Readonly<Partial<StandardMaterial>>): StandardMaterial {
  return createEntity({
    kind: StandardMaterialKind,
    name: options?.name ?? null,
  });
}
