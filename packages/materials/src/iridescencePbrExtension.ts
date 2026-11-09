import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import type { IridescencePbrExtension } from './contract.materials-types.ts';
import { IridescencePbrExtensionKind } from './contract.materials-types.ts';
import {
  isValidMaterialIor,
  isValidMaterialIridescenceThickness,
  isValidMaterialWeight,
} from './materialValidation.ts';
import { isValidPbrUvSet } from './pbrExtension.ts';

export function createIridescencePbrExtension(
  opts?: Readonly<Partial<IridescencePbrExtension>>,
): IridescencePbrExtension {
  const out = allocateEntity<IridescencePbrExtension>();
  initializeIridescencePbrExtension(out, opts);
  return out;
}

export function initializeIridescencePbrExtension(
  out: EntityConstruction<IridescencePbrExtension>,
  opts?: Readonly<Partial<IridescencePbrExtension>>,
): void {
  out.iridescence = opts?.iridescence ?? 0;
  out.iridescenceIor = opts?.iridescenceIor ?? 1.3;
  out.iridescenceMap = opts?.iridescenceMap ?? null;
  out.iridescenceMapUvSet = opts?.iridescenceMapUvSet ?? 0;
  out.iridescenceThicknessMap = opts?.iridescenceThicknessMap ?? null;
  out.iridescenceThicknessMapUvSet = opts?.iridescenceThicknessMapUvSet ?? 0;
  out.iridescenceThicknessMax = opts?.iridescenceThicknessMax ?? 400;
  out.iridescenceThicknessMin = opts?.iridescenceThicknessMin ?? 100;
  out.kind = IridescencePbrExtensionKind;
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
