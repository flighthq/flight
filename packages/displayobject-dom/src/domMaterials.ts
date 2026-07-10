import type { DomBlendModeFidelity, DomRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

// Auditable map from a blend-mode intent to the CSS mix-blend-mode value that realizes
// it. `null` means there is no faithful CSS equivalent, so the mode degrades to normal
// compositing (the empty string, i.e. mix-blend-mode: normal).
const DOM_BLEND_MODE: Record<BlendMode, string | null> = {
  [BlendMode.Add]: 'screen',
  [BlendMode.Alpha]: null,
  [BlendMode.Darken]: 'darken',
  [BlendMode.Difference]: 'difference',
  [BlendMode.Erase]: null,
  [BlendMode.HardLight]: 'hard-light',
  [BlendMode.Invert]: null,
  [BlendMode.Layer]: '',
  [BlendMode.Lighten]: 'lighten',
  [BlendMode.Multiply]: 'multiply',
  [BlendMode.Normal]: '',
  [BlendMode.Overlay]: 'overlay',
  [BlendMode.Screen]: 'screen',
  [BlendMode.Shader]: null,
  [BlendMode.Subtract]: null,
};

// Fidelity classification for each blend mode in the DOM backend.
// 'exact'       — CSS mix-blend-mode maps faithfully to the OpenFL/Flash mode.
// 'approximate' — the closest CSS mode is used; results differ in edge cases
//                 (e.g. Add → screen: similar luminosity behavior but not additive-clipped-to-1).
// 'unsupported' — no CSS equivalent; falls back to normal compositing.
const DOM_BLEND_MODE_FIDELITY: Record<BlendMode, DomBlendModeFidelity> = {
  [BlendMode.Add]: 'approximate', // screen ≈ add for moderate values; clamps differently
  [BlendMode.Alpha]: 'unsupported',
  [BlendMode.Darken]: 'exact',
  [BlendMode.Difference]: 'exact',
  [BlendMode.Erase]: 'unsupported',
  [BlendMode.HardLight]: 'exact',
  [BlendMode.Invert]: 'unsupported',
  [BlendMode.Layer]: 'exact', // normal compositing within a stacking context
  [BlendMode.Lighten]: 'exact',
  [BlendMode.Multiply]: 'exact',
  [BlendMode.Normal]: 'exact',
  [BlendMode.Overlay]: 'exact',
  [BlendMode.Screen]: 'exact',
  [BlendMode.Shader]: 'unsupported',
  [BlendMode.Subtract]: 'unsupported',
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
