import { createEntity } from '@flighthq/entity';
import type { StandardMaterial } from '@flighthq/types';
import { StandardMaterialKind } from '@flighthq/types';

export function createStandardMaterial(options?: Readonly<Partial<StandardMaterial>>): StandardMaterial {
  return createEntity({
    kind: StandardMaterialKind,
    name: options?.name ?? null,
  });
}
