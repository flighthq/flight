import type { CanvasRenderState } from '@flighthq/types';
import { AdvancedBlendMode, BlendMode } from '@flighthq/types';

import { getCanvasRenderStateRuntime } from './canvasRenderState';

// Auditable map from a blend-mode intent to the Canvas2D globalCompositeOperation
// that realizes it. `null` means there is no faithful Canvas2D equivalent, so the
// mode degrades to normal ('source-over') compositing. Canvas2D is the one backend that natively
// realizes the destination-reading AdvancedBlendMode set too (via globalCompositeOperation), so those
// keys are carried here — a caller can hand a display object either a fixed-function BlendMode or an
// AdvancedBlendMode string and Canvas resolves both, even though only the fixed-function set is exposed
// as a node property.
const CANVAS_BLEND_MODE: Record<BlendMode, GlobalCompositeOperation | null> = {
  [BlendMode.Add]: 'lighter',
  [BlendMode.Darken]: 'darken',
  [BlendMode.Lighten]: 'lighten',
  [BlendMode.Multiply]: 'multiply',
  [BlendMode.Normal]: 'source-over',
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

export function applyCanvasBlendMode(state: CanvasRenderState, value: BlendMode | null): void {
  const runtime = getCanvasRenderStateRuntime(state);
  if (value === runtime.currentBlendMode) return;
  runtime.currentBlendMode = value;
  state.context.globalCompositeOperation = (value !== null ? CANVAS_BLEND_MODE[value] : null) ?? 'source-over';
}

export function enableCanvasBlendMode(state: CanvasRenderState): void {
  state.applyBlendMode = applyCanvasBlendMode;
}
