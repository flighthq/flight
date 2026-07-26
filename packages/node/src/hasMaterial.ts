import type { HasMaterial } from '@flighthq/types/contract';

export function initMaterialTrait(target: HasMaterial, obj?: Readonly<Partial<HasMaterial>>): void {
  target.material = obj?.material ?? null;
  target.materialData = obj?.materialData ?? null;
}
