import type { LottieLayerHandler, LottieRegistry } from '@flighthq/types/contract';
import { LottieLayerKind } from '@flighthq/types/contract';

import { lottieImageLayerHandler } from './lottieImageLayer.ts';
import { lottieNullLayerHandler } from './lottieNullLayer.ts';
import { lottiePrecompositionLayerHandler } from './lottiePrecompositionLayer.ts';
import { registerLottieLayerHandler } from './lottieRegistry.ts';
import { lottieShapeLayerHandler } from './lottieShapeLayer.ts';
import { lottieSolidLayerHandler } from './lottieSolidLayer.ts';
import { lottieTextLayerHandler } from './lottieTextLayer.ts';

/**
 * The layer family: every handler Flight reads a Lottie layer with, and the registrar that installs them all.
 *
 * ★ THIS FILE IS THE PRESET AND NOTHING ELSE. Each handler now lives in the module that owns its interpretation, so
 * naming one handler links one layer kind while importing THIS module links all six — the sprite and texture code for
 * images, the text label for text, and the whole shape render stack. It used to hold six one-line shims into readers
 * retained in the document core, which meant a caller who wanted null layers alone still linked every one of them.
 *
 * Nothing here registers itself. `registerLottieLayerHandlers` is the explicit step a zero-config caller takes.
 */
export function registerLottieLayerHandlers(registry: LottieRegistry): void {
  registerLottieLayerHandler(registry, LottieLayerKind.Precomposition, lottiePrecompositionLayerHandler);
  registerLottieLayerHandler(registry, LottieLayerKind.Solid, lottieSolidLayerHandler);
  registerLottieLayerHandler(registry, LottieLayerKind.Image, lottieImageLayerHandler);
  registerLottieLayerHandler(registry, LottieLayerKind.Null, lottieNullLayerHandler);
  registerLottieLayerHandler(registry, LottieLayerKind.Shape, lottieShapeLayerHandler);
  registerLottieLayerHandler(registry, LottieLayerKind.Text, lottieTextLayerHandler);
}

export const lottieAllLayerHandlers: readonly LottieLayerHandler[] = [
  lottieImageLayerHandler,
  lottieNullLayerHandler,
  lottiePrecompositionLayerHandler,
  lottieShapeLayerHandler,
  lottieSolidLayerHandler,
  lottieTextLayerHandler,
];
