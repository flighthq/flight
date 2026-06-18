import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

// Auditable map from a blend-mode intent to the Canvas2D globalCompositeOperation
// that realizes it. `null` means there is no faithful Canvas2D equivalent, so the
// mode degrades to normal ('source-over') compositing.
const CANVAS_BLEND_MODE: Record<BlendMode, GlobalCompositeOperation | null> = {
  [BlendMode.Add]: 'lighter',
  [BlendMode.Alpha]: null,
  [BlendMode.Darken]: 'darken',
  [BlendMode.Difference]: 'difference',
  [BlendMode.Erase]: null,
  [BlendMode.Hardlight]: 'hard-light',
  [BlendMode.Invert]: null,
  [BlendMode.Layer]: 'source-over',
  [BlendMode.Lighten]: 'lighten',
  [BlendMode.Multiply]: 'multiply',
  [BlendMode.Normal]: 'source-over',
  [BlendMode.Overlay]: 'overlay',
  [BlendMode.Screen]: 'screen',
  [BlendMode.Shader]: null,
  [BlendMode.Subtract]: null,
};

export function applyCanvasBlendMode(state: CanvasRenderState, value: BlendMode | null): void {
  if (value === state.currentBlendMode) return;
  state.currentBlendMode = value;
  state.context.globalCompositeOperation = (value !== null ? CANVAS_BLEND_MODE[value] : null) ?? 'source-over';
}

export function enableCanvasBlendModeSupport(state: CanvasRenderState): void {
  state.applyBlendMode = applyCanvasBlendMode;
}
