import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import type { StandardMaterial } from './contract.materials-types.ts';
import { StandardMaterialKind } from './contract.materials-types.ts';

export function createStandardMaterial(options?: Readonly<Partial<StandardMaterial>>): StandardMaterial {
  const out = allocateEntity<StandardMaterial>();
  initializeStandardMaterial(out, options);
  return out;
}

export function initializeStandardMaterial(
  out: EntityConstruction<StandardMaterial>,
  options?: Readonly<Partial<StandardMaterial>>,
): void {
  out.kind = StandardMaterialKind;
  out.name = options?.name ?? null;
}
