import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { WrappedDiffusePbrExtension } from '@flighthq/types/contract';
import { WrappedDiffusePbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createWrappedDiffusePbrExtension(
  opts?: Readonly<Partial<WrappedDiffusePbrExtension>>,
): WrappedDiffusePbrExtension {
  const out = allocateEntity<WrappedDiffusePbrExtension>();
  out.kind = WrappedDiffusePbrExtensionKind;
  out.thickness = opts?.thickness ?? 0;
  out.thicknessMap = opts?.thicknessMap ?? null;
  out.thicknessMapUvSet = opts?.thicknessMapUvSet ?? 0;
  out.wrappedDiffuseColor = opts?.wrappedDiffuseColor ?? 0xffffffff;
  out.wrappedDiffuseMap = opts?.wrappedDiffuseMap ?? null;
  out.wrappedDiffuseMapUvSet = opts?.wrappedDiffuseMapUvSet ?? 0;
  out.wrappedDiffuseStrength = opts?.wrappedDiffuseStrength ?? 0;
  return finishEntity(out);
}

export function isValidWrappedDiffusePbrExtension(value: Readonly<WrappedDiffusePbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.wrappedDiffuseStrength) &&
    Number.isFinite(value.thickness) &&
    value.thickness >= 0 &&
    isValidPbrUvSet(value.thicknessMapUvSet) &&
    isValidPbrUvSet(value.wrappedDiffuseMapUvSet)
  );
}
