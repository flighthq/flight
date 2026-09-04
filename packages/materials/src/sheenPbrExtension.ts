import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { SheenPbrExtension } from '@flighthq/types/contract';
import { SheenPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createSheenPbrExtension(opts?: Readonly<Partial<SheenPbrExtension>>): SheenPbrExtension {
  const out = allocateEntity<SheenPbrExtension>();
  out.kind = SheenPbrExtensionKind;
  out.sheenColor = opts?.sheenColor ?? 0x000000ff;
  out.sheenColorMap = opts?.sheenColorMap ?? null;
  out.sheenColorMapUvSet = opts?.sheenColorMapUvSet ?? 0;
  out.sheenRoughness = opts?.sheenRoughness ?? 0;
  out.sheenRoughnessMap = opts?.sheenRoughnessMap ?? null;
  out.sheenRoughnessMapUvSet = opts?.sheenRoughnessMapUvSet ?? 0;
  return finishEntity(out);
}

export function isValidSheenPbrExtension(value: Readonly<SheenPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.sheenRoughness) &&
    isValidPbrUvSet(value.sheenColorMapUvSet) &&
    isValidPbrUvSet(value.sheenRoughnessMapUvSet)
  );
}
