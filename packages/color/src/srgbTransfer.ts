// Generated from crates/flight-color/src/srgb_transfer.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * The IEC 61966-2-1 linear-to-sRGB inverse OETF for a single channel in [0, 1].
 * The canonical linear-to-sRGB channel transfer for the whole SDK; the packed form is
 * `packLinearToColor`. Does not clamp -- callers that need HDR clamping do so explicitly.
 */
export function linearChannelToSrgb(value: number): number {
  if (value <= 0.0031308) {
    return value * 12.92;
  }
  return 1.055 * Math.pow(value, 1.0 / 2.4) - 0.055;
}

/**
 * The IEC 61966-2-1 sRGB electro-optical transfer function for a single channel in [0, 1].
 * The canonical sRGB-to-linear channel transfer for the whole SDK -- the single decode seam
 * that `unpackColorToLinear` and `getColorLuminance` build on. Does not clamp.
 */
export function srgbChannelToLinear(value: number): number {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return Math.pow((value + 0.055) / 1.055, 2.4);
}
