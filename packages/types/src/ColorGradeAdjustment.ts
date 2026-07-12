import type { ColorLutAdjustment } from './ColorLutAdjustment';

// The full pointwise color grade as one LUT-tier adjustment: exposure/brightness/contrast/saturation/
// temperature/tint (the linear-ish tone controls) plus a lift/gamma/gain stage (shadows/midtones/
// highlights). All fields default to neutral, so a grade setting only some fields leaves the rest
// unchanged. Because gamma makes the composite nonlinear, the whole grade bakes into one ColorLut.
export interface ColorGradeAdjustment extends ColorLutAdjustment {
  kind: 'ColorGradeAdjustment';
  exposure?: number; // exposure in stops, 0 = unchanged.
  brightness?: number; // additive brightness, 0 = unchanged.
  contrast?: number; // contrast multiplier about mid-grey, 1 = unchanged.
  saturation?: number; // saturation multiplier, 1 = unchanged.
  temperature?: number; // warm(+)/cool(-) shift, 0 = unchanged.
  tint?: number; // green(+)/magenta(-) shift, 0 = unchanged.
  lift?: number; // packed RGBA shadow offset, neutral 0x000000ff.
  gamma?: number; // packed RGBA midtone gamma, neutral 0x808080ff.
  gain?: number; // packed RGBA highlight gain, neutral 0xffffffff.
}
