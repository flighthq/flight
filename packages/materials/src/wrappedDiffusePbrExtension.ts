import { createEntity } from '@flighthq/entity/contract';
import type { WrappedDiffusePbrExtension } from '@flighthq/types/contract';
import { WrappedDiffusePbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createWrappedDiffusePbrExtension(
  opts?: Readonly<Partial<WrappedDiffusePbrExtension>>,
): WrappedDiffusePbrExtension {
  return createEntity({
    kind: WrappedDiffusePbrExtensionKind,
    thickness: opts?.thickness ?? 0,
    thicknessMap: opts?.thicknessMap ?? null,
    thicknessMapUvSet: opts?.thicknessMapUvSet ?? 0,
    wrappedDiffuseColor: opts?.wrappedDiffuseColor ?? 0xffffffff,
    wrappedDiffuseMap: opts?.wrappedDiffuseMap ?? null,
    wrappedDiffuseMapUvSet: opts?.wrappedDiffuseMapUvSet ?? 0,
    wrappedDiffuseStrength: opts?.wrappedDiffuseStrength ?? 0,
  });
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
