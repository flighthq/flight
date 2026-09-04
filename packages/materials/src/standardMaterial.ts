import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { StandardMaterial } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

export function createStandardMaterial(options?: Readonly<Partial<StandardMaterial>>): StandardMaterial {
  const out = allocateEntity<StandardMaterial>();
  out.kind = StandardMaterialKind;
  out.name = options?.name ?? null;
  return finishEntity(out);
}
