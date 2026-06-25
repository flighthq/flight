// Tone-mapping recipe math. Substrate-agnostic evaluators for all ToneMapEffect operators so every
// backend shares one implementation. All scalar functions operate on a single linear-light luminance
// or RGB value (per-channel application is the caller's responsibility). All matrix functions write
// into caller-provided arrays. All functions are alias-safe.

// Narkowicz ACES filmic approximation — a fast sigmoid fit to the full ACES RRT+ODT.
// Reference: Narkowicz 2015, "ACES Filmic Tone Mapping Curve".
export function computeAcesToneMap(x: number): number {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

// AgX tone map — a modern open-domain operator designed for accuracy over the sRGB gamut.
// Reference: Sobotka 2022 / Filament AgX. Operates on a single channel; apply per-channel.
export function computeAgxToneMap(x: number): number {
  // Simple piecewise AgX-shaped sigmoid (approximate).
  // More accurate version requires the full matrix + per-channel curve; this is the scalar sigmoid.
  const min_ev = -12.47393;
  const max_ev = 4.026069;
  const val = Math.max(1e-10, x);
  const log = Math.max(min_ev, Math.min(max_ev, Math.log2(val)));
  const normalized = (log - min_ev) / (max_ev - min_ev);
  // Apply AgX contrast S-curve (6th-degree polynomial fit).
  return agxDefaultContrastApprox(normalized);
}

// Converts an exposure value (EV, photographer's stops) to a linear scene-light multiplier.
// EV=0 → 1.0, EV=1 → 2.0, EV=-1 → 0.5. Apply before tone mapping.
export function computeExposureScale(exposure: number): number {
  return Math.pow(2, exposure);
}

// Lottes 2016 filmic operator ("Advanced Techniques and Optimization of VDB Volume").
// A smooth S-curve with adjustable shoulder and contrast.
export function computeFilmicToneMap(x: number): number {
  // Simplified GT operator (Uchimura 2017 approximation commonly called "filmic" in engines).
  const maxBrightness = 1.0;
  const contrast = 1.0;
  const linearStart = 0.22;
  const linearLength = 0.4;
  const blackTighten = 1.33;
  const pedestal = 0.0;
  const l0 = ((maxBrightness - linearStart) * linearLength) / contrast;
  const L0 = linearStart - linearStart / contrast;
  const L1 = linearStart + (1.0 - linearStart) / contrast;
  const S0 = linearStart + l0;
  const S1 = linearStart + contrast * l0;
  const C2 = contrast / (maxBrightness - S1);
  const CP = -C2 / Math.log(2);
  const w0 = 1.0 - smoothstep01(linearStart, S0, x);
  const T = linearStart * Math.pow(x / linearStart, blackTighten) + pedestal;
  const L = linearStart + contrast * (x - linearStart);
  const S = maxBrightness - (maxBrightness - S1) * Math.exp(CP * (x - S0));
  return Math.max(0, w0 * (1.0 - smoothstep01(L0, L1, x)) * T + smoothstep01(L0, L1, x) * L + (1.0 - w0) * S);
}

// Extended Reinhard with white-point: out = x * (1 + x/w²) / (1 + x). At x == w the output is 1.
// White point `w` should be the maximum scene luminance (default ~∞ → standard Reinhard).
export function computeReinhardExtendedToneMap(x: number, white: number): number {
  const w2 = white * white;
  return (x * (1 + x / w2)) / (1 + x);
}

// Reinhard tone map operator: out = x / (1 + x). Compresses HDR to [0, 1).
export function computeReinhardToneMap(x: number): number {
  return x / (1 + x);
}

// Hable "Uncharted 2" filmic tone map (John Hable's partial/final equation).
// Reference: Hable 2010, "Filmic Tonemapping with Piecewise Power Curves".
export function computeUncharted2ToneMap(x: number): number {
  const A = 0.15;
  const B = 0.5;
  const C = 0.1;
  const D = 0.2;
  const E = 0.02;
  const F = 0.3;
  return (x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F) - E / F;
}

// ACES input matrix (converts sRGB to ACES AP0). Writes a column-major 3×3 matrix (9 values) into `out`.
// Alias-safe: computes all values before writing.
export function getAcesInputMatrix(out: Float32Array): void {
  // sRGB D65 → ACES AP0 D60
  out[0] = 0.59719;
  out[1] = 0.076;
  out[2] = 0.0284;
  out[3] = 0.35458;
  out[4] = 0.90834;
  out[5] = 0.13383;
  out[6] = 0.04823;
  out[7] = 0.01566;
  out[8] = 0.83777;
}

// ACES output matrix (converts ACES AP1 to sRGB). Writes a column-major 3×3 matrix (9 values) into `out`.
// Alias-safe.
export function getAcesOutputMatrix(out: Float32Array): void {
  // ACES AP1 → sRGB D65
  out[0] = 1.60475;
  out[1] = -0.10208;
  out[2] = -0.00327;
  out[3] = -0.53108;
  out[4] = 1.10813;
  out[5] = -0.07276;
  out[6] = -0.07367;
  out[7] = -0.00605;
  out[8] = 1.07602;
}

function agxDefaultContrastApprox(x: number): number {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
