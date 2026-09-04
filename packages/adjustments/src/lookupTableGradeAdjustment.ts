import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ColorTransformFunction,
  EntityRuntimeKey,
  LookupTableGradeAdjustment,
  EntityConstruction,
} from '@flighthq/types/contract';

import { sampleColorLut } from './colorLut';
import { initializeColorLutAdjustment } from './colorLutAdjustment';

export function createLookupTableGradeAdjustment(
  options: Readonly<Omit<LookupTableGradeAdjustment, typeof EntityRuntimeKey | 'kind' | 'transform'>> = {},
): LookupTableGradeAdjustment {
  const out = allocateEntity<LookupTableGradeAdjustment>();
  initializeLookupTableGradeAdjustment(out, options);
  return finishEntity(out);
}

// A supplied 3D color grade LUT applied at `strength`. Unlike the other LUT-tier ops it is ALREADY a LUT,
// so it carries one directly; its transform trilinearly samples the carried `lut` and mixes toward it by
// `strength` (0 = original, 1 = full grade). With no `lut` supplied it is identity (a neutral
// passthrough), matching the old lookupTableGradeEffect. Because it exposes a `transform`, it fuses with
// neighbouring adjustments — a run containing it (matrices included) bakes into one LUT.
export function initializeLookupTableGradeAdjustment(
  out: EntityConstruction<LookupTableGradeAdjustment>,
  options: Readonly<Omit<LookupTableGradeAdjustment, typeof EntityRuntimeKey | 'kind' | 'transform'>> = {},
): void {
  const lut = options.lut;
  const strength = options.strength ?? 1;
  const transform: ColorTransformFunction = (out, r, g, b) => {
    if (lut === undefined || strength <= 0) {
      out[0] = r;
      out[1] = g;
      out[2] = b;
      return;
    }
    sampleColorLut(lut, out, r, g, b);
    out[0] = r + (out[0] - r) * strength;
    out[1] = g + (out[1] - g) * strength;
    out[2] = b + (out[2] - b) * strength;
  };
  initializeColorLutAdjustment(out, 'LookupTableGradeAdjustment', transform);
  out.lut = options.lut;
  out.strength = options.strength ?? 1;
}
