import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { AnisotropyPbrExtension } from '@flighthq/types/contract';
import { AnisotropyPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createAnisotropyPbrExtension(opts?: Readonly<Partial<AnisotropyPbrExtension>>): AnisotropyPbrExtension {
  const out = allocateEntity<AnisotropyPbrExtension>();
  out.anisotropyMap = opts?.anisotropyMap ?? null;
  out.anisotropyMapUvSet = opts?.anisotropyMapUvSet ?? 0;
  out.anisotropyRotation = opts?.anisotropyRotation ?? 0;
  out.anisotropyStrength = opts?.anisotropyStrength ?? 0;
  out.kind = AnisotropyPbrExtensionKind;
  return finishEntity(out);
}

export function isValidAnisotropyPbrExtension(value: Readonly<AnisotropyPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.anisotropyStrength) &&
    Number.isFinite(value.anisotropyRotation) &&
    isValidPbrUvSet(value.anisotropyMapUvSet)
  );
}
