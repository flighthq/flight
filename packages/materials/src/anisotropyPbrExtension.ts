import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import type { AnisotropyPbrExtension } from './contract.materials-types.ts';
import { AnisotropyPbrExtensionKind } from './contract.materials-types.ts';
import { isValidMaterialWeight } from './materialValidation.ts';
import { isValidPbrUvSet } from './pbrExtension.ts';

export function createAnisotropyPbrExtension(opts?: Readonly<Partial<AnisotropyPbrExtension>>): AnisotropyPbrExtension {
  const out = allocateEntity<AnisotropyPbrExtension>();
  initializeAnisotropyPbrExtension(out, opts);
  return out;
}

export function initializeAnisotropyPbrExtension(
  out: EntityConstruction<AnisotropyPbrExtension>,
  opts?: Readonly<Partial<AnisotropyPbrExtension>>,
): void {
  out.anisotropyMap = opts?.anisotropyMap ?? null;
  out.anisotropyMapUvSet = opts?.anisotropyMapUvSet ?? 0;
  out.anisotropyRotation = opts?.anisotropyRotation ?? 0;
  out.anisotropyStrength = opts?.anisotropyStrength ?? 0;
  out.kind = AnisotropyPbrExtensionKind;
}

export function isValidAnisotropyPbrExtension(value: Readonly<AnisotropyPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.anisotropyStrength) &&
    Number.isFinite(value.anisotropyRotation) &&
    isValidPbrUvSet(value.anisotropyMapUvSet)
  );
}
