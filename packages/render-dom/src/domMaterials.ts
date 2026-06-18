import type { DOMRenderState } from '@flighthq/types';
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
  [BlendMode.Hardlight]: 'hard-light',
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

export function applyDOMBlendMode(element: HTMLElement, value: BlendMode | null): void {
  element.style.mixBlendMode = (value !== null ? DOM_BLEND_MODE[value] : null) ?? '';
}

export function enableDOMBlendModeSupport(state: DOMRenderState): void {
  state.applyBlendMode = applyDOMBlendMode;
}
