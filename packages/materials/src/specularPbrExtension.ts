import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { SpecularPbrExtension } from '@flighthq/types/contract';
import { SpecularPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createSpecularPbrExtension(opts?: Readonly<Partial<SpecularPbrExtension>>): SpecularPbrExtension {
  const out = allocateEntity<SpecularPbrExtension>();
  out.kind = SpecularPbrExtensionKind;
  out.specular = opts?.specular ?? 1;
  out.specularColor = opts?.specularColor ?? 0xffffffff;
  out.specularColorMap = opts?.specularColorMap ?? null;
  out.specularColorMapUvSet = opts?.specularColorMapUvSet ?? 0;
  out.specularMap = opts?.specularMap ?? null;
  out.specularMapUvSet = opts?.specularMapUvSet ?? 0;
  return finishEntity(out);
}

export function isValidSpecularPbrExtension(value: Readonly<SpecularPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.specular) &&
    isValidPbrUvSet(value.specularColorMapUvSet) &&
    isValidPbrUvSet(value.specularMapUvSet)
  );
}
