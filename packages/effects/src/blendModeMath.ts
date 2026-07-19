import { AdvancedBlendMode } from '@flighthq/types';

// Pure blend-mode math — the substrate-agnostic ground truth the GL (and any future) backend shaders
// mirror, so the composite-recipe fragment source can be verified against plain numbers. All values are
// normalized 0..1 (backdrop `cb`, source `cs`). The formulas follow the W3C Compositing and Blending
// spec: the seven separable modes blend each channel independently (getSeparableBlendChannel); the four
// non-separable HSL modes blend a whole RGB triple by transplanting one HSL attribute
// (blendNonSeparableRgb). getAdvancedBlendRgb dispatches either path by mode, writing into `out`.
//
// This is the blend function B(cb, cs) alone — the caller composites B into the final pixel with the
// backdrop/source alphas (Porter-Duff source-over of the blended color), which is a separate step the
// backend's alpha compositing performs. Unknown modes fall through to Normal (the source color).

// The four non-separable HSL blend modes on 0..1 RGB, following the W3C spec's Hue/Sat/Color/Lum
// primitives (Lum via a luminosity-preserving clip, Sat via setSat on sorted channels). Writes the
// blended triple into `out[0..2]`. Alias-safe: reads all inputs before writing `out`. Unknown modes
// fall through to the source triple (Normal).
export function blendNonSeparableRgb(
  mode: AdvancedBlendMode,
  cbR: number,
  cbG: number,
  cbB: number,
  csR: number,
  csG: number,
  csB: number,
  out: [number, number, number] | Float32Array | number[],
): void {
  let r: number;
  let g: number;
  let b: number;
  switch (mode) {
    case AdvancedBlendMode.Hue:
      // Source hue, backdrop saturation, backdrop luminosity.
      [r, g, b] = setBlendSaturation(csR, csG, csB, blendSaturation(cbR, cbG, cbB));
      [r, g, b] = setBlendLuminosity(r, g, b, blendLuminosity(cbR, cbG, cbB));
      break;
    case AdvancedBlendMode.Saturation:
      // Backdrop hue, source saturation, backdrop luminosity.
      [r, g, b] = setBlendSaturation(cbR, cbG, cbB, blendSaturation(csR, csG, csB));
      [r, g, b] = setBlendLuminosity(r, g, b, blendLuminosity(cbR, cbG, cbB));
      break;
    case AdvancedBlendMode.Color:
      // Source hue + saturation, backdrop luminosity.
      [r, g, b] = setBlendLuminosity(csR, csG, csB, blendLuminosity(cbR, cbG, cbB));
      break;
    case AdvancedBlendMode.Luminosity:
      // Backdrop hue + saturation, source luminosity.
      [r, g, b] = setBlendLuminosity(cbR, cbG, cbB, blendLuminosity(csR, csG, csB));
      break;
    default:
      r = csR;
      g = csG;
      b = csB;
      break;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

// Dispatches the advanced blend for a whole RGB triple, writing the blended (pre-alpha-composite) color
// into `out[0..2]`. Separable modes reduce to three getSeparableBlendChannel calls; the HSL modes route
// to blendNonSeparableRgb. Alias-safe: reads all six inputs before writing `out`.
export function getAdvancedBlendRgb(
  mode: AdvancedBlendMode,
  cbR: number,
  cbG: number,
  cbB: number,
  csR: number,
  csG: number,
  csB: number,
  out: [number, number, number] | Float32Array | number[],
): void {
  if (isNonSeparableBlendMode(mode)) {
    blendNonSeparableRgb(mode, cbR, cbG, cbB, csR, csG, csB, out);
    return;
  }
  const r = getSeparableBlendChannel(mode, cbR, csR);
  const g = getSeparableBlendChannel(mode, cbG, csG);
  const b = getSeparableBlendChannel(mode, cbB, csB);
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

// Separable per-channel blend on 0..1 values (backdrop `cb`, source `cs`). Covers the seven separable
// AdvancedBlendMode members; any non-separable or unknown mode returns the source channel (Normal).
export function getSeparableBlendChannel(mode: AdvancedBlendMode, cb: number, cs: number): number {
  switch (mode) {
    case AdvancedBlendMode.Overlay:
      // Overlay = HardLight with operands swapped: hard-light the backdrop by the source.
      return cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case AdvancedBlendMode.HardLight:
      return cs <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case AdvancedBlendMode.SoftLight: {
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (d - cb);
    }
    case AdvancedBlendMode.Difference:
      return Math.abs(cb - cs);
    case AdvancedBlendMode.Exclusion:
      return cb + cs - 2 * cb * cs;
    case AdvancedBlendMode.ColorDodge:
      // W3C: 0→0, source==1→1, else min(1, backdrop / (1 - source)).
      if (cb <= 0) return 0;
      if (cs >= 1) return 1;
      return Math.min(1, cb / (1 - cs));
    case AdvancedBlendMode.ColorBurn:
      // W3C: 1→1, source==0→0, else 1 - min(1, (1 - backdrop) / source).
      if (cb >= 1) return 1;
      if (cs <= 0) return 0;
      return 1 - Math.min(1, (1 - cb) / cs);
    default:
      return cs;
  }
}

// True for the four non-separable HSL blend modes (Hue/Saturation/Color/Luminosity), which cannot be
// computed per channel because they transplant a whole HSL attribute from one triple to the other.
export function isNonSeparableBlendMode(mode: AdvancedBlendMode): boolean {
  return (
    mode === AdvancedBlendMode.Hue ||
    mode === AdvancedBlendMode.Saturation ||
    mode === AdvancedBlendMode.Color ||
    mode === AdvancedBlendMode.Luminosity
  );
}

// W3C lum(): the Rec.601 luma of an RGB triple.
function blendLuminosity(r: number, g: number, b: number): number {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

// W3C sat(): the chroma range (max - min) of an RGB triple.
function blendSaturation(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// W3C ClipColor(): pull any out-of-gamut channel back toward the color's luminosity so the result stays
// in 0..1 without shifting perceived brightness.
function clipBlendColor(r: number, g: number, b: number): [number, number, number] {
  const l = blendLuminosity(r, g, b);
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  let cr = r;
  let cg = g;
  let cb = b;
  if (min < 0) {
    const denom = l - min;
    cr = l + ((cr - l) * l) / denom;
    cg = l + ((cg - l) * l) / denom;
    cb = l + ((cb - l) * l) / denom;
  }
  if (max > 1) {
    const denom = max - l;
    cr = l + ((cr - l) * (1 - l)) / denom;
    cg = l + ((cg - l) * (1 - l)) / denom;
    cb = l + ((cb - l) * (1 - l)) / denom;
  }
  return [cr, cg, cb];
}

// W3C SetLum(): shift an RGB triple to the target luminosity, then clip back into gamut.
function setBlendLuminosity(r: number, g: number, b: number, target: number): [number, number, number] {
  const d = target - blendLuminosity(r, g, b);
  return clipBlendColor(r + d, g + d, b + d);
}

// W3C SetSat(): rescale an RGB triple's mid/max channels to the target saturation while pinning its
// minimum to black, preserving hue. Operates by resolving the sorted (min, mid, max) positions.
function setBlendSaturation(r: number, g: number, b: number, target: number): [number, number, number] {
  const out: [number, number, number] = [r, g, b];
  // Indices of the min / mid / max channels.
  let iMin = 0;
  let iMax = 0;
  for (let i = 1; i < 3; i++) {
    if (out[i] < out[iMin]) iMin = i;
    if (out[i] > out[iMax]) iMax = i;
  }
  if (iMin === iMax) {
    // All channels equal after a degenerate sort — pick a distinct mid deterministically.
    iMax = (iMin + 1) % 3;
  }
  const iMid = 3 - iMin - iMax;
  if (out[iMax] > out[iMin]) {
    out[iMid] = ((out[iMid] - out[iMin]) * target) / (out[iMax] - out[iMin]);
    out[iMax] = target;
  } else {
    out[iMid] = 0;
    out[iMax] = 0;
  }
  out[iMin] = 0;
  return out;
}
