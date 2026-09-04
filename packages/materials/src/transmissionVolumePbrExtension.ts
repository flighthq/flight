import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TransmissionVolumePbrExtension } from '@flighthq/types/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialIor, isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createTransmissionVolumePbrExtension(
  opts?: Readonly<Partial<TransmissionVolumePbrExtension>>,
): TransmissionVolumePbrExtension {
  const out = allocateEntity<TransmissionVolumePbrExtension>();
  out.attenuationColor = opts?.attenuationColor ?? 0xffffffff;
  out.attenuationDistance = opts?.attenuationDistance ?? Infinity;
  out.ior = opts?.ior ?? 1.5;
  out.kind = TransmissionVolumePbrExtensionKind;
  out.thickness = opts?.thickness ?? 0;
  out.thicknessMap = opts?.thicknessMap ?? null;
  out.thicknessMapUvSet = opts?.thicknessMapUvSet ?? 0;
  out.transmission = opts?.transmission ?? 0;
  out.transmissionMap = opts?.transmissionMap ?? null;
  out.transmissionMapUvSet = opts?.transmissionMapUvSet ?? 0;
  return finishEntity(out);
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
