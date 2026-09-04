import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { SheenPbrExtension, EntityConstruction } from '@flighthq/types/contract';
import { SheenPbrExtensionKind } from '@flighthq/types/contract';

import { isValidMaterialWeight } from './materialValidation';
import { isValidPbrUvSet } from './pbrExtension';

export function createSheenPbrExtension(opts?: Readonly<Partial<SheenPbrExtension>>): SheenPbrExtension {
  const out = allocateEntity<SheenPbrExtension>();
  initializeSheenPbrExtension(out, opts);
  return finishEntity(out);
}

export function initializeSheenPbrExtension(
  out: EntityConstruction<SheenPbrExtension>,
  opts?: Readonly<Partial<SheenPbrExtension>>,
): void {
  out.kind = SheenPbrExtensionKind;
  out.sheenColor = opts?.sheenColor ?? 0x000000ff;
  out.sheenColorMap = opts?.sheenColorMap ?? null;
  out.sheenColorMapUvSet = opts?.sheenColorMapUvSet ?? 0;
  out.sheenRoughness = opts?.sheenRoughness ?? 0;
  out.sheenRoughnessMap = opts?.sheenRoughnessMap ?? null;
  out.sheenRoughnessMapUvSet = opts?.sheenRoughnessMapUvSet ?? 0;
}

export function isValidSheenPbrExtension(value: Readonly<SheenPbrExtension>): boolean {
  return (
    isValidMaterialWeight(value.sheenRoughness) &&
    isValidPbrUvSet(value.sheenColorMapUvSet) &&
    isValidPbrUvSet(value.sheenRoughnessMapUvSet)
  );
}
