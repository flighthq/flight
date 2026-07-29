import { createEntity } from '@flighthq/entity/contract';
import type { ClearcoatPbrExtension } from '@flighthq/types/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createClearcoatPbrExtension(opts?: Readonly<Partial<ClearcoatPbrExtension>>): ClearcoatPbrExtension {
  return createEntity({
    clearcoat: opts?.clearcoat ?? 0,
    clearcoatMap: opts?.clearcoatMap ?? null,
    clearcoatMapUvSet: opts?.clearcoatMapUvSet ?? 0,
    clearcoatNormalMap: opts?.clearcoatNormalMap ?? null,
    clearcoatNormalMapUvSet: opts?.clearcoatNormalMapUvSet ?? 0,
    clearcoatNormalScale: opts?.clearcoatNormalScale ?? 1,
    clearcoatRoughness: opts?.clearcoatRoughness ?? 0,
    clearcoatRoughnessMap: opts?.clearcoatRoughnessMap ?? null,
    clearcoatRoughnessMapUvSet: opts?.clearcoatRoughnessMapUvSet ?? 0,
    kind: ClearcoatPbrExtensionKind,
  });
}

export function isValidClearcoatPbrExtension(value: Readonly<ClearcoatPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.clearcoat) &&
    isValidMaterialWeight(value.clearcoatRoughness) &&
    Number.isFinite(value.clearcoatNormalScale) &&
    value.clearcoatNormalScale >= 0 &&
    isValidPbrUvSet(value.clearcoatMapUvSet) &&
    isValidPbrUvSet(value.clearcoatNormalMapUvSet) &&
    isValidPbrUvSet(value.clearcoatRoughnessMapUvSet)
  );
}
