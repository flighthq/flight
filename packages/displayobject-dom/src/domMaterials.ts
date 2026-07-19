import type { DomBlendModeFidelity, DomRenderState } from '@flighthq/types';
import { AdvancedBlendMode, BlendMode } from '@flighthq/types';

// Auditable map from a blend-mode intent to the CSS mix-blend-mode value that realizes
// it. `null` means there is no faithful CSS equivalent, so the mode degrades to normal
// compositing (the empty string, i.e. mix-blend-mode: normal). Like Canvas2D, DOM natively realizes the
// AdvancedBlendMode set (CSS mix-blend-mode covers the full W3C set), so those keys are carried here too;
// only the fixed-function BlendMode set is exposed as a node property.
const DOM_BLEND_MODE: Record<BlendMode, string | null> = {
  [BlendMode.Add]: 'screen',
  [BlendMode.Darken]: 'darken',
  [BlendMode.Lighten]: 'lighten',
  [BlendMode.Multiply]: 'multiply',
  [BlendMode.Normal]: '',
  [BlendMode.Screen]: 'screen',
  [AdvancedBlendMode.Color]: 'color',
  [AdvancedBlendMode.ColorBurn]: 'color-burn',
  [AdvancedBlendMode.ColorDodge]: 'color-dodge',
  [AdvancedBlendMode.Difference]: 'difference',
  [AdvancedBlendMode.Exclusion]: 'exclusion',
  [AdvancedBlendMode.HardLight]: 'hard-light',
  [AdvancedBlendMode.Hue]: 'hue',
  [AdvancedBlendMode.Luminosity]: 'luminosity',
  [AdvancedBlendMode.Overlay]: 'overlay',
  [AdvancedBlendMode.Saturation]: 'saturation',
  [AdvancedBlendMode.SoftLight]: 'soft-light',
};

// Fidelity classification for each blend mode in the DOM backend.
// 'exact'       — CSS mix-blend-mode maps faithfully to the OpenFL/Flash mode.
// 'approximate' — the closest CSS mode is used; results differ in edge cases
//                 (e.g. Add → screen: similar luminosity behavior but not additive-clipped-to-1).
// 'unsupported' — no CSS equivalent; falls back to normal compositing.
const DOM_BLEND_MODE_FIDELITY: Record<BlendMode, DomBlendModeFidelity> = {
  [BlendMode.Add]: 'approximate', // screen ≈ add for moderate values; clamps differently
  [BlendMode.Darken]: 'exact',
  [BlendMode.Lighten]: 'exact',
  [BlendMode.Multiply]: 'exact',
  [BlendMode.Normal]: 'exact',
  [BlendMode.Screen]: 'exact',
  [AdvancedBlendMode.Color]: 'exact',
  [AdvancedBlendMode.ColorBurn]: 'exact',
  [AdvancedBlendMode.ColorDodge]: 'exact',
  [AdvancedBlendMode.Difference]: 'exact',
  [AdvancedBlendMode.Exclusion]: 'exact',
  [AdvancedBlendMode.HardLight]: 'exact',
  [AdvancedBlendMode.Hue]: 'exact',
  [AdvancedBlendMode.Luminosity]: 'exact',
  [AdvancedBlendMode.Overlay]: 'exact',
  [AdvancedBlendMode.Saturation]: 'exact',
  [AdvancedBlendMode.SoftLight]: 'exact',
};

export function applyDomBlendMode(element: HTMLElement, value: BlendMode | null): void {
  element.style.mixBlendMode = (value !== null ? DOM_BLEND_MODE[value] : null) ?? '';
}

export function enableDomBlendModeSupport(state: DomRenderState): void {
  state.applyBlendMode = applyDomBlendMode;
}

/**
 * Returns the fidelity of the DOM backend's realization of the given blend mode via CSS
 * mix-blend-mode. Use this to detect lossy or unsupported modes before committing to a DOM
 * render path for blend-sensitive content.
 *
 * - 'exact'       — CSS result is perceptually identical to the OpenFL/Flash mode.
 * - 'approximate' — closest CSS mode is used; may differ for extreme or mid-range colors.
 * - 'unsupported' — no CSS equivalent; the DOM backend renders as BlendMode.Normal.
 */
export function getDomBlendModeFidelity(blendMode: BlendMode): DomBlendModeFidelity {
  return DOM_BLEND_MODE_FIDELITY[blendMode];
}
