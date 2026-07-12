import type { ColorLut } from './ColorLut';
import type { ColorLutAdjustment } from './ColorLutAdjustment';

// A supplied 3D color grade LUT applied at `strength` (0 = original, 1 = full grade). Already a LUT, so
// it carries one directly (`lut`); with no `lut` it is identity (a neutral passthrough). Its `transform`
// samples `lut` and mixes toward it by `strength`, so it fuses with neighbouring adjustments like any
// other LUT-tier op.
export interface LookupTableGradeAdjustment extends ColorLutAdjustment {
  kind: 'LookupTableGradeAdjustment';
  lut?: ColorLut;
  strength?: number; // 0 = original, 1 = full grade. Default 1.
}
