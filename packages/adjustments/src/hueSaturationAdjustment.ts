import type { ColorTransformFunction, HueSaturationAdjustment } from '@flighthq/types';

// Hue/saturation/lightness as a LUT-tier adjustment. The transform is the exact HSL round-trip the old
// hueSaturationEffect shader did — convert to HSL, rotate hue, scale saturation, offset lightness,
// convert back — ported faithfully so the look is unchanged while the op now fuses into a baked LUT.
export function createHueSaturationAdjustment(
  options: Readonly<Omit<HueSaturationAdjustment, 'kind' | 'transform'>> = {},
): HueSaturationAdjustment {
  const hue = (options.hue ?? 0) / 360;
  const saturation = options.saturation ?? 1;
  const lightness = options.lightness ?? 0;
  const transform: ColorTransformFunction = (out, r, g, b) => {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (mx + mn) * 0.5;
    const d = mx - mn;
    if (d > 0.0001) {
      s = l < 0.5 ? d / (mx + mn) : d / (2 - mx - mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    h = fract(h + hue);
    s = clamp01(s * saturation);
    const ln = clamp01(l + lightness);
    if (s <= 0) {
      out[0] = ln;
      out[1] = ln;
      out[2] = ln;
      return;
    }
    const q = ln < 0.5 ? ln * (1 + s) : ln + s - ln * s;
    const p = 2 * ln - q;
    out[0] = hue2rgb(p, q, h + 1 / 3);
    out[1] = hue2rgb(p, q, h);
    out[2] = hue2rgb(p, q, h - 1 / 3);
  };
  return { kind: 'HueSaturationAdjustment', ...options, transform };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function hue2rgb(p: number, q: number, tRaw: number): number {
  let t = tRaw;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
