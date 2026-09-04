import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ClearcoatPbrExtension } from '@flighthq/types/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createClearcoatPbrExtension(opts?: Readonly<Partial<ClearcoatPbrExtension>>): ClearcoatPbrExtension {
  const out = allocateEntity<ClearcoatPbrExtension>();
  out.clearcoat = opts?.clearcoat ?? 0;
  out.clearcoatMap = opts?.clearcoatMap ?? null;
  out.clearcoatMapUvSet = opts?.clearcoatMapUvSet ?? 0;
  out.clearcoatNormalMap = opts?.clearcoatNormalMap ?? null;
  out.clearcoatNormalMapUvSet = opts?.clearcoatNormalMapUvSet ?? 0;
  out.clearcoatNormalScale = opts?.clearcoatNormalScale ?? 1;
  out.clearcoatRoughness = opts?.clearcoatRoughness ?? 0;
  out.clearcoatRoughnessMap = opts?.clearcoatRoughnessMap ?? null;
  out.clearcoatRoughnessMapUvSet = opts?.clearcoatRoughnessMapUvSet ?? 0;
  out.kind = ClearcoatPbrExtensionKind;
  return finishEntity(out);
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
