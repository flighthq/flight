import { createEntity } from '@flighthq/entity/contract';
import type { AnisotropyPbrExtension } from '@flighthq/types/contract';
import { AnisotropyPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createAnisotropyPbrExtension(opts?: Readonly<Partial<AnisotropyPbrExtension>>): AnisotropyPbrExtension {
  return createEntity({
    anisotropyMap: opts?.anisotropyMap ?? null,
    anisotropyMapUvSet: opts?.anisotropyMapUvSet ?? 0,
    anisotropyRotation: opts?.anisotropyRotation ?? 0,
    anisotropyStrength: opts?.anisotropyStrength ?? 0,
    kind: AnisotropyPbrExtensionKind,
  });
}

export function isValidAnisotropyPbrExtension(value: Readonly<AnisotropyPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.anisotropyStrength) &&
    Number.isFinite(value.anisotropyRotation) &&
    isValidPbrUvSet(value.anisotropyMapUvSet)
  );
}
