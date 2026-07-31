import { getCanvasRenderStateRuntime } from '@flighthq/scene2d-canvas/contract';
import type {
  AdvancedBlendMode,
  BlendEffect,
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Advanced-blend composite pass: draw a registered backdrop, then draw the incoming layer over it with
// the Canvas 2D compositing operation named by the effect's `mode`. This is the Canvas realization of the
// `BlendEffect` recipe — the escape hatch for the AdvancedBlendMode set the fixed-function BlendMode enum
// cannot express.
//
// Canvas 2D is the one backend where this is native rather than emulated. Its blend
// globalCompositeOperation values implement the same W3C formula the GL pass spells out in GLSL —
// cs' = (1 - ab) * cs + ab * B(cb, cs), then Porter-Duff source-over — so there is no shader, no
// offscreen bounce beyond the one the pipeline already provides, and no per-pixel readback. `opacity`
// maps to globalAlpha, which scales the source alpha ahead of compositing exactly as the GL pass's
// `layer.a * u_opacity` does.
//
// An unregistered or absent `backdropKey` composites the layer over an implicit transparent backdrop,
// which reduces to a source-over passthrough rather than erroring — matching the GL contract.
export function applyBlendEffectToCanvas(
  state: CanvasRenderState,
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<BlendEffect>,
): void {
  const backdrop = getCanvasBlendEffectBackdrop(state, effect.backdropKey ?? null);
  if (backdrop === null) {
    drawCanvasEffectPass(dest, source, 'none');
    return;
  }

  const operation = getCanvasBlendEffectCompositeOperation(effect.mode);
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);
  // The backdrop goes down first and unblended: it is the destination the mode reads, so it has to be
  // present in `dest` before the layer is drawn. Drawing the layer first and the backdrop second would
  // blend in the opposite direction, which is a different image for every non-commutative mode.
  ctx.drawImage(backdrop.canvas, 0, 0);
  ctx.globalAlpha = effect.opacity ?? 1;
  ctx.globalCompositeOperation = operation;
  ctx.drawImage(source.canvas, 0, 0);
  ctx.restore();
}

export const defaultCanvasBlendEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBlendEffectToCanvas(ctx.state, ctx.source, ctx.dest, effect as BlendEffect);
};

// Returns the backdrop registered under `backdropKey` for this state, or null when the key is null or
// nothing is registered. Doubles as the introspection query behind the passthrough fallback: a caller
// that wants to know whether a blend will actually blend asks here rather than inferring it from pixels.
export function getCanvasBlendEffectBackdrop(
  state: CanvasRenderState,
  backdropKey: string | null,
): CanvasRenderTarget | null {
  if (backdropKey === null) return null;
  return getCanvasRenderStateRuntime(state).canvasBlendEffectBackdrops?.get(backdropKey) ?? null;
}

// Maps an AdvancedBlendMode to the Canvas 2D globalCompositeOperation that realizes it. Every one of the
// eleven modes has a native operation, including the four non-separable HSL ones, which is why this
// backend needs no blend math of its own. An unrecognized mode — a vendor-prefixed kind Canvas has never
// heard of — falls back to 'source-over', the same Normal passthrough the GL pass gives an unknown mode.
export function getCanvasBlendEffectCompositeOperation(mode: AdvancedBlendMode): GlobalCompositeOperation {
  return BLEND_MODE_OPERATION[mode] ?? 'source-over';
}

export function registerCanvasBlendEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'BlendEffect', defaultCanvasBlendEffectRunner);
}

// Registers a backdrop target under `backdropKey` for this state, so a BlendEffect naming that key blends
// its layer over the target. Last write wins. The registry holds the target only and never owns or frees
// it — the caller keeps ownership of the canvas, as with the GL texture registry.
export function registerCanvasBlendEffectBackdrop(
  state: CanvasRenderState,
  backdropKey: string,
  target: CanvasRenderTarget,
): void {
  const runtime = getCanvasRenderStateRuntime(state);
  (runtime.canvasBlendEffectBackdrops ??= new Map()).set(backdropKey, target);
}

// Removes the backdrop registered under `backdropKey`, returning true when one was present. The target
// itself is the caller's to dispose; this only drops the registry reference.
export function unregisterCanvasBlendEffectBackdrop(state: CanvasRenderState, backdropKey: string): boolean {
  return getCanvasRenderStateRuntime(state).canvasBlendEffectBackdrops?.delete(backdropKey) ?? false;
}

// AdvancedBlendMode → Canvas 2D globalCompositeOperation. Alphabetical by mode, matching the value order
// in the AdvancedBlendMode namespace.
const BLEND_MODE_OPERATION: Readonly<Record<string, GlobalCompositeOperation>> = {
  Color: 'color',
  ColorBurn: 'color-burn',
  ColorDodge: 'color-dodge',
  Difference: 'difference',
  Exclusion: 'exclusion',
  HardLight: 'hard-light',
  Hue: 'hue',
  Luminosity: 'luminosity',
  Overlay: 'overlay',
  Saturation: 'saturation',
  SoftLight: 'soft-light',
};
