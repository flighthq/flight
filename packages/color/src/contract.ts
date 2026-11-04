// Generated from crates/flight-color/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { colorFromKelvin } from './colorFromKelvin.ts';
export { allocateHslColor, hslToRgb, rgbToHsl } from './hslColorRaw.ts';
export type { HslColorRaw } from './hslColorRaw.ts';
export { allocateHsvColor, hsvToRgb, rgbToHsv } from './hsvColorRaw.ts';
export type { HsvColorRaw } from './hsvColorRaw.ts';
export { lerpColor, lerpLinearColor } from './lerpColor.ts';
export {
  getColorContrastRatio,
  getColorLuminance,
  getRec2020LuminanceWeights,
  getRec709LuminanceWeights,
} from './luminance.ts';
export { clampLinearRgb, linearRgbToOklab, oklabToLinearRgb } from './oklab.ts';
export {
  allocateLinearColor,
  computeRgbHexString,
  computeRgbaCssString,
  getColorAlpha,
  getColorRgb,
  packColor,
  packLinearChannelsToColor,
  packLinearToColor,
  packOpaqueColor,
  setColorAlpha,
  unpackColorRgba,
  unpackColorToLinear,
} from './packColor.ts';
export type { LinearColorRaw } from './packColor.ts';
export { premultiplyColorAlpha, unpremultiplyColorAlpha } from './premultiplyColorAlpha.ts';
export { linearChannelToSrgb, srgbChannelToLinear } from './srgbTransfer.ts';
export { HslColor } from './hslColor.ts';
export { HsvColor } from './hsvColor.ts';
export { LinearColor } from './linearColor.ts';
