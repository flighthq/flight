import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { IridescencePbrExtension } from '@flighthq/types/contract';
import { IridescencePbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialIor, isValidMaterialIridescenceThickness, isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createIridescencePbrExtension(
  opts?: Readonly<Partial<IridescencePbrExtension>>,
): IridescencePbrExtension {
  const out = allocateEntity<IridescencePbrExtension>();
  out.iridescence = opts?.iridescence ?? 0;
  out.iridescenceIor = opts?.iridescenceIor ?? 1.3;
  out.iridescenceMap = opts?.iridescenceMap ?? null;
  out.iridescenceMapUvSet = opts?.iridescenceMapUvSet ?? 0;
  out.iridescenceThicknessMap = opts?.iridescenceThicknessMap ?? null;
  out.iridescenceThicknessMapUvSet = opts?.iridescenceThicknessMapUvSet ?? 0;
  out.iridescenceThicknessMax = opts?.iridescenceThicknessMax ?? 400;
  out.iridescenceThicknessMin = opts?.iridescenceThicknessMin ?? 100;
  out.kind = IridescencePbrExtensionKind;
  return finishEntity(out);
}

export function isValidIridescencePbrExtension(value: Readonly<IridescencePbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.iridescence) &&
    isValidMaterialIor(value.iridescenceIor) &&
    isValidMaterialIridescenceThickness(value.iridescenceThicknessMin) &&
    isValidMaterialIridescenceThickness(value.iridescenceThicknessMax) &&
    value.iridescenceThicknessMin <= value.iridescenceThicknessMax &&
    isValidPbrUvSet(value.iridescenceMapUvSet) &&
    isValidPbrUvSet(value.iridescenceThicknessMapUvSet)
  );
}
