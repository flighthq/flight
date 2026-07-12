import type { ColorGradeAdjustment, ColorTransformFunction } from '@flighthq/types';

// The full color grade as one LUT-tier adjustment. The exposure/brightness/temperature/tint/saturation/
// contrast stage is ported faithfully from the old colorGradeEffect shader; a lift/gamma/gain stage
// (shadows/midtones/highlights) follows it, all defaulting to neutral so a grade setting only some
// fields leaves the rest unchanged. Gamma makes the composite nonlinear, so the whole grade bakes to one
// LUT. Note: the old colorGradeEffect default had contrast 0 (its shader read `contrast ?? 1`); the
// identity default here is contrast 1.
export function createColorGradeAdjustment(
  options: Readonly<Omit<ColorGradeAdjustment, 'kind' | 'transform'>> = {},
): ColorGradeAdjustment {
  const exposure = Math.pow(2, options.exposure ?? 0);
  const brightness = options.brightness ?? 0;
  const contrast = options.contrast ?? 1;
  const saturation = options.saturation ?? 1;
  const temperature = options.temperature ?? 0;
  const tint = options.tint ?? 0;
  const lift = unpackRgb(options.lift ?? 0x000000ff);
  const gammaRaw = unpackRgb(options.gamma ?? 0x808080ff);
  const gain = unpackRgb(options.gain ?? 0xffffffff);
  const gammaExp: [number, number, number] = [
    1 / Math.max(gammaRaw[0] * 2, 1e-3),
    1 / Math.max(gammaRaw[1] * 2, 1e-3),
    1 / Math.max(gammaRaw[2] * 2, 1e-3),
  ];
  const transform: ColorTransformFunction = (out, r, g, b) => {
    let cr = r * exposure + brightness + temperature * 0.5;
    let cg = g * exposure + brightness + tint * 0.5;
    let cb = b * exposure + brightness - temperature * 0.5;
    const luma = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
    cr = luma + (cr - luma) * saturation;
    cg = luma + (cg - luma) * saturation;
    cb = luma + (cb - luma) * saturation;
    cr = (cr - 0.5) * contrast + 0.5;
    cg = (cg - 0.5) * contrast + 0.5;
    cb = (cb - 0.5) * contrast + 0.5;
    // Lift/gamma/gain stage (neutral by default).
    cr = Math.pow(Math.max(cr * gain[0] + lift[0] * (1 - cr), 0), gammaExp[0]);
    cg = Math.pow(Math.max(cg * gain[1] + lift[1] * (1 - cg), 0), gammaExp[1]);
    cb = Math.pow(Math.max(cb * gain[2] + lift[2] * (1 - cb), 0), gammaExp[2]);
    out[0] = clamp01(cr);
    out[1] = clamp01(cg);
    out[2] = clamp01(cb);
  };
  return { kind: 'ColorGradeAdjustment', ...options, transform };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function unpackRgb(c: number): [number, number, number] {
  return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255];
}
