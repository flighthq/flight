import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/types/contract';

import type { SpecularPbrExtension } from './contract.materials-types.ts';
import { SpecularPbrExtensionKind } from './contract.materials-types.ts';
import { isValidMaterialWeight } from './materialValidation.ts';
import { isValidPbrUvSet } from './pbrExtension.ts';

export function createSpecularPbrExtension(opts?: Readonly<Partial<SpecularPbrExtension>>): SpecularPbrExtension {
  const out = allocateEntity<SpecularPbrExtension>();
  initializeSpecularPbrExtension(out, opts);
  return finishEntity(out);
}

export function initializeSpecularPbrExtension(
  out: EntityConstruction<SpecularPbrExtension>,
  opts?: Readonly<Partial<SpecularPbrExtension>>,
): void {
  out.kind = SpecularPbrExtensionKind;
  out.specular = opts?.specular ?? 1;
  out.specularColor = opts?.specularColor ?? 0xffffffff;
  out.specularColorMap = opts?.specularColorMap ?? null;
  out.specularColorMapUvSet = opts?.specularColorMapUvSet ?? 0;
  out.specularMap = opts?.specularMap ?? null;
  out.specularMapUvSet = opts?.specularMapUvSet ?? 0;
}

export function isValidSpecularPbrExtension(value: Readonly<SpecularPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.specular) &&
    isValidPbrUvSet(value.specularColorMapUvSet) &&
    isValidPbrUvSet(value.specularMapUvSet)
  );
}
