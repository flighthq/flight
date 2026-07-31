import type {
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CompositeEffect,
  CompositeOperator,
} from '@flighthq/types/contract';
import { CompositeOperator as CompositeOperatorValues } from '@flighthq/types/contract';

import { getCanvasBlendEffectBackdrop } from './canvasBlendEffect';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Porter-Duff composite pass: lay down a registered backdrop, then draw the incoming layer over it under
// the Canvas 2D operation named by the effect's `operator`. This is the Canvas realization of the
// CompositeEffect — the coverage-combining sibling of the color-mixing BlendEffect.
//
// Canvas 2D owns this vocabulary outright: `globalCompositeOperation` IS the Porter-Duff set, and the
// CompositeOperator names were taken from it, so ten of the eleven operators are a direct rename and the
// GL pass's `Fa*layer + Fb*backdrop` factor maths has no counterpart here. `Clear` is the exception —
// Canvas has no 'clear' operation — and it is realized by clearing the target and drawing neither input,
// which is what both coverage factors being zero means.
//
// The backdrop registry is shared with BlendEffect, matching GL, where both effects read
// getGlBlendEffectBackdrop. A null or unregistered key composites against an implicit TRANSPARENT
// backdrop rather than erroring, and that is load-bearing rather than a fallback: it is what makes the
// operator still meaningful with nothing registered. SourceOver reduces to a passthrough, while the
// masking operators (SourceIn, DestinationIn, DestinationAtop) reduce to a clear, because compositing
// against zero coverage is exactly what they are defined to do.
export function applyCompositeEffectToCanvas(
  state: CanvasRenderState,
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<CompositeEffect>,
): void {
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);

  // Clear discards both inputs by definition, so it must not draw the backdrop either — the cleared
  // target IS the result. Returning before the backdrop draw is the whole implementation.
  if (effect.operator !== CompositeOperatorValues.Clear) {
    const backdrop = getCanvasBlendEffectBackdrop(state, effect.backdropKey ?? null);
    // The backdrop is the DESTINATION every operator is defined against, so it has to be in the target
    // before the layer lands. Its absence is a transparent destination, not a skipped composite.
    if (backdrop !== null) ctx.drawImage(backdrop.canvas, 0, 0);
    ctx.globalCompositeOperation = getCanvasCompositeEffectOperation(effect.operator);
    ctx.drawImage(source.canvas, 0, 0);
  }

  ctx.restore();
}

export const defaultCanvasCompositeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyCompositeEffectToCanvas(ctx.state, ctx.source, ctx.dest, effect as CompositeEffect);
};

// Maps a CompositeOperator to the Canvas 2D globalCompositeOperation that realizes it. An unrecognized
// operator — a vendor-prefixed one Canvas has never heard of — falls back to 'source-over', matching the
// GL pass, which maps an unknown operator to the SourceOver branch.
//
// `Clear` is deliberately absent from the table: Canvas has no 'clear' operation, and the caller above
// handles it by clearing rather than by drawing. Asking for it here returns the SourceOver fallback,
// which is why that branch must never reach this function.
export function getCanvasCompositeEffectOperation(operator: CompositeOperator): GlobalCompositeOperation {
  return COMPOSITE_OPERATOR_OPERATION[operator] ?? 'source-over';
}

export function registerCanvasCompositeEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'CompositeEffect', defaultCanvasCompositeEffectRunner);
}

// CompositeOperator → Canvas 2D globalCompositeOperation. Ten of the eleven operators are a direct
// rename of the same Porter-Duff term; `Clear` has no Canvas operation and is handled by the caller.
const COMPOSITE_OPERATOR_OPERATION: Readonly<Record<string, GlobalCompositeOperation>> = {
  [CompositeOperatorValues.Copy]: 'copy',
  [CompositeOperatorValues.DestinationAtop]: 'destination-atop',
  [CompositeOperatorValues.DestinationIn]: 'destination-in',
  [CompositeOperatorValues.DestinationOut]: 'destination-out',
  [CompositeOperatorValues.DestinationOver]: 'destination-over',
  [CompositeOperatorValues.SourceAtop]: 'source-atop',
  [CompositeOperatorValues.SourceIn]: 'source-in',
  [CompositeOperatorValues.SourceOut]: 'source-out',
  [CompositeOperatorValues.SourceOver]: 'source-over',
  [CompositeOperatorValues.Xor]: 'xor',
};
