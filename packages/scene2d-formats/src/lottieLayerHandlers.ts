import type { LottieLayerContext, LottieLayerHandler, LottieRegistry } from '@flighthq/types/contract';
import { LottieLayerKind } from '@flighthq/types/contract';

import {
  lottieImageLayerReader,
  lottieNullLayerReader,
  lottiePrecompositionLayerReader,
  lottieShapeLayerReader,
  lottieSolidLayerReader,
  lottieTextLayerReader,
} from './lottieDocument.ts';
import { registerLottieLayerHandler } from './lottieRegistry.ts';

export function lottieImageLayerHandler(context: LottieLayerContext): void {
  lottieImageLayerReader(context);
}

export function lottieNullLayerHandler(context: LottieLayerContext): void {
  lottieNullLayerReader(context);
}

export function lottiePrecompositionLayerHandler(context: LottieLayerContext): void {
  lottiePrecompositionLayerReader(context);
}

export function lottieShapeLayerHandler(context: LottieLayerContext): void {
  lottieShapeLayerReader(context);
}

export function lottieSolidLayerHandler(context: LottieLayerContext): void {
  lottieSolidLayerReader(context);
}

export function lottieTextLayerHandler(context: LottieLayerContext): void {
  lottieTextLayerReader(context);
}

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
