import { createEntity } from '@flighthq/entity/contract';
import type { TransmissionVolumePbrExtension } from '@flighthq/types/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialIor, isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createTransmissionVolumePbrExtension(
  opts?: Readonly<Partial<TransmissionVolumePbrExtension>>,
): TransmissionVolumePbrExtension {
  return createEntity({
    attenuationColor: opts?.attenuationColor ?? 0xffffffff,
    attenuationDistance: opts?.attenuationDistance ?? Infinity,
    ior: opts?.ior ?? 1.5,
    kind: TransmissionVolumePbrExtensionKind,
    thickness: opts?.thickness ?? 0,
    thicknessMap: opts?.thicknessMap ?? null,
    thicknessMapUvSet: opts?.thicknessMapUvSet ?? 0,
    transmission: opts?.transmission ?? 0,
    transmissionMap: opts?.transmissionMap ?? null,
    transmissionMapUvSet: opts?.transmissionMapUvSet ?? 0,
  });
}

export function isValidTransmissionVolumePbrExtension(value: Readonly<TransmissionVolumePbrExtension>): boolean {
  const validAttenuationDistance =
    value.attenuationDistance === Infinity ||
    (Number.isFinite(value.attenuationDistance) && value.attenuationDistance > 0);
  return (
    isValidMaterialWeight(value.transmission) &&
    isValidMaterialIor(value.ior) &&
    Number.isFinite(value.thickness) &&
    value.thickness >= 0 &&
    validAttenuationDistance &&
    isValidPbrUvSet(value.thicknessMapUvSet) &&
    isValidPbrUvSet(value.transmissionMapUvSet)
  );
}
