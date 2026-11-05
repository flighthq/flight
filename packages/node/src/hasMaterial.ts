import type { HasMaterial } from './contract.node-types.ts';

export function initMaterialTrait(target: HasMaterial, obj?: Readonly<Partial<HasMaterial>>): void {
  target.material = obj?.material ?? null;
  target.materialData = obj?.materialData ?? null;
}
