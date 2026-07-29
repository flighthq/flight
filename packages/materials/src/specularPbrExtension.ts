import { createEntity } from '@flighthq/entity/contract';
import type { SpecularPbrExtension } from '@flighthq/types/contract';
import { SpecularPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createSpecularPbrExtension(opts?: Readonly<Partial<SpecularPbrExtension>>): SpecularPbrExtension {
  return createEntity({
    kind: SpecularPbrExtensionKind,
    specular: opts?.specular ?? 1,
    specularColor: opts?.specularColor ?? 0xffffffff,
    specularColorMap: opts?.specularColorMap ?? null,
    specularColorMapUvSet: opts?.specularColorMapUvSet ?? 0,
    specularMap: opts?.specularMap ?? null,
    specularMapUvSet: opts?.specularMapUvSet ?? 0,
  });
}

export function isValidSpecularPbrExtension(value: Readonly<SpecularPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.specular) &&
    isValidPbrUvSet(value.specularColorMapUvSet) &&
    isValidPbrUvSet(value.specularMapUvSet)
  );
}
