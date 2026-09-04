import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ColorTransformFunction,
  EntityRuntimeKey,
  LiftGammaGainAdjustment,
  EntityConstruction,
} from '@flighthq/types/contract';

import { initializeColorLutAdjustment } from './colorLutAdjustment';

export function createLiftGammaGainAdjustment(
  options: Readonly<Omit<LiftGammaGainAdjustment, typeof EntityRuntimeKey | 'kind' | 'transform'>> = {},
): LiftGammaGainAdjustment {
  const out = allocateEntity<LiftGammaGainAdjustment>();
  initializeLiftGammaGainAdjustment(out, options);
  return finishEntity(out);
}

// Lift/gamma/gain as a LUT-tier adjustment (gamma is the nonlinear part). Ported faithfully from the old
// liftGammaGainEffect shader: gain multiplies, lift offsets toward the packed neutral, gamma applies a
// per-channel power curve. Packed-RGBA neutrals: lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff.
export function initializeLiftGammaGainAdjustment(
  out: EntityConstruction<LiftGammaGainAdjustment>,
  options: Readonly<Omit<LiftGammaGainAdjustment, typeof EntityRuntimeKey | 'kind' | 'transform'>> = {},
): void {
  const lift = unpackRgb(options.lift ?? 0x000000ff);
  const gammaRaw = unpackRgb(options.gamma ?? 0x808080ff);
  const gain = unpackRgb(options.gain ?? 0xffffffff);
  // Map gamma's 0.5-neutral to a 1.0-neutral exponent so 0x808080 leaves the image unchanged.
  const gammaExp: [number, number, number] = [
    1 / Math.max(gammaRaw[0] * 2, 1e-3),
    1 / Math.max(gammaRaw[1] * 2, 1e-3),
    1 / Math.max(gammaRaw[2] * 2, 1e-3),
  ];
  const transform: ColorTransformFunction = (out, r, g, b) => {
    out[0] = clamp01(Math.pow(Math.max(r * gain[0] + lift[0] * (1 - r), 0), gammaExp[0]));
    out[1] = clamp01(Math.pow(Math.max(g * gain[1] + lift[1] * (1 - g), 0), gammaExp[1]));
    out[2] = clamp01(Math.pow(Math.max(b * gain[2] + lift[2] * (1 - b), 0), gammaExp[2]));
  };
  initializeColorLutAdjustment(out, 'LiftGammaGainAdjustment', transform);
  out.lift = options.lift ?? 0x000000ff;
  out.gamma = options.gamma ?? 0x808080ff;
  out.gain = options.gain ?? 0xffffffff;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Unpacks a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b]. Alpha is dropped — grade values
// describe RGB channels only.
function unpackRgb(c: number): [number, number, number] {
  return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255];
}
