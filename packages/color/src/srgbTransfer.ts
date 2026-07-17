// The IEC 61966-2-1 linear-to-sRGB inverse OETF for a single channel in [0, 1].
// The canonical linear→sRGB channel transfer for the whole SDK; the packed form is
// `packLinearToColor`. Does not clamp — callers that need HDR clamping do so explicitly.
export function linearChannelToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

// The IEC 61966-2-1 sRGB electro-optical transfer function for a single channel in [0, 1].
// The canonical sRGB→linear channel transfer for the whole SDK — the single decode seam
// (§0.2) `unpackColorToLinear` and `getColorLuminance` build on. Does not clamp.
export function srgbChannelToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
