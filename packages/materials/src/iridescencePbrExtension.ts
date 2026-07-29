import { createEntity } from '@flighthq/entity/contract';
import type { IridescencePbrExtension } from '@flighthq/types/contract';
import { IridescencePbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialIor, isValidMaterialIridescenceThickness, isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createIridescencePbrExtension(
  opts?: Readonly<Partial<IridescencePbrExtension>>,
): IridescencePbrExtension {
  return createEntity({
    iridescence: opts?.iridescence ?? 0,
    iridescenceIor: opts?.iridescenceIor ?? 1.3,
    iridescenceMap: opts?.iridescenceMap ?? null,
    iridescenceMapUvSet: opts?.iridescenceMapUvSet ?? 0,
    iridescenceThicknessMap: opts?.iridescenceThicknessMap ?? null,
    iridescenceThicknessMapUvSet: opts?.iridescenceThicknessMapUvSet ?? 0,
    iridescenceThicknessMax: opts?.iridescenceThicknessMax ?? 400,
    iridescenceThicknessMin: opts?.iridescenceThicknessMin ?? 100,
    kind: IridescencePbrExtensionKind,
  });
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
