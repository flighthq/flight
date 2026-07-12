import type { ColorTransformFunction, LookupTableGradeAdjustment } from '@flighthq/types';

import { sampleColorLut } from './colorLut';

// A supplied 3D color grade LUT applied at `strength`. Unlike the other LUT-tier ops it is ALREADY a LUT,
// so it carries one directly; its transform trilinearly samples the carried `lut` and mixes toward it by
// `strength` (0 = original, 1 = full grade). With no `lut` supplied it is identity (a neutral
// passthrough), matching the old lookupTableGradeEffect. Because it exposes a `transform`, it fuses with
// neighbouring adjustments — a run containing it (matrices included) bakes into one LUT.
export function createLookupTableGradeAdjustment(
  options: Readonly<Omit<LookupTableGradeAdjustment, 'kind' | 'transform'>> = {},
): LookupTableGradeAdjustment {
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
  return { kind: 'LookupTableGradeAdjustment', ...options, transform };
}
