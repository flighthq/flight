import { createEntity } from '@flighthq/entity/contract';
import type { SheenPbrExtension } from '@flighthq/types/contract';
import { SheenPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createSheenPbrExtension(opts?: Readonly<Partial<SheenPbrExtension>>): SheenPbrExtension {
  return createEntity({
    kind: SheenPbrExtensionKind,
    sheenColor: opts?.sheenColor ?? 0x000000ff,
    sheenColorMap: opts?.sheenColorMap ?? null,
    sheenColorMapUvSet: opts?.sheenColorMapUvSet ?? 0,
    sheenRoughness: opts?.sheenRoughness ?? 0,
    sheenRoughnessMap: opts?.sheenRoughnessMap ?? null,
    sheenRoughnessMapUvSet: opts?.sheenRoughnessMapUvSet ?? 0,
  });
}

export function isValidSheenPbrExtension(value: Readonly<SheenPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.sheenRoughness) &&
    isValidPbrUvSet(value.sheenColorMapUvSet) &&
    isValidPbrUvSet(value.sheenRoughnessMapUvSet)
  );
}
