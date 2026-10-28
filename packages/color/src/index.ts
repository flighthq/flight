// Generated from crates/flight-color/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  allocateHslColor,
  allocateHsvColor,
  allocateLinearColor,
  clampLinearRgb,
  colorFromKelvin,
  computeRgbHexString,
  computeRgbaCssString,
  getColorAlpha,
  getColorContrastRatio,
  getColorLuminance,
  getColorRgb,
  getRec2020LuminanceWeights,
  getRec709LuminanceWeights,
  hslToRgb,
  hsvToRgb,
  lerpColor,
  lerpLinearColor,
  linearChannelToSrgb,
  linearRgbToOklab,
  oklabToLinearRgb,
  packColor,
  packLinearChannelsToColor,
  packLinearToColor,
  packOpaqueColor,
  premultiplyColorAlpha,
  rgbToHsl,
  rgbToHsv,
  setColorAlpha,
  srgbChannelToLinear,
  unpackColorRgba,
  unpackColorToLinear,
  unpremultiplyColorAlpha,
} from './contract.ts';
export { HslColor } from './hslColor.ts';
export { HsvColor } from './hsvColor.ts';
export { LinearColor } from './linearColor.ts';
