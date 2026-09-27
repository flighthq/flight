import type { LottieRegistry, LottieShapeItemContext, LottieShapeItemHandler } from '@flighthq/types/contract';
import { LottieShapeItemKind } from '@flighthq/types/contract';

import {
  lottieEllipseShapeItemReader,
  lottieFillShapeItemReader,
  lottieGradientFillShapeItemReader,
  lottieGradientStrokeShapeItemReader,
  lottiePathShapeItemReader,
  lottiePolystarShapeItemReader,
  lottieRectangleShapeItemReader,
  lottieStrokeShapeItemReader,
  lottieTrimPathShapeItemReader,
} from './lottieDocument.ts';
import { registerLottieShapeItemHandler } from './lottieRegistry.ts';

export function lottieEllipseShapeItemHandler(context: LottieShapeItemContext): void {
  lottieEllipseShapeItemReader(context);
}

export function lottieFillShapeItemHandler(context: LottieShapeItemContext): void {
  lottieFillShapeItemReader(context);
}

export function lottieGradientFillShapeItemHandler(context: LottieShapeItemContext): void {
  lottieGradientFillShapeItemReader(context);
}

export function lottieGradientStrokeShapeItemHandler(context: LottieShapeItemContext): void {
  lottieGradientStrokeShapeItemReader(context);
}

export function lottiePathShapeItemHandler(context: LottieShapeItemContext): void {
  lottiePathShapeItemReader(context);
}

export function lottiePolystarShapeItemHandler(context: LottieShapeItemContext): void {
  lottiePolystarShapeItemReader(context);
}

export function lottieRectangleShapeItemHandler(context: LottieShapeItemContext): void {
  lottieRectangleShapeItemReader(context);
}

export function lottieStrokeShapeItemHandler(context: LottieShapeItemContext): void {
  lottieStrokeShapeItemReader(context);
}

export function lottieTrimPathShapeItemHandler(context: LottieShapeItemContext): void {
  lottieTrimPathShapeItemReader(context);
}

export function registerLottieShapeItemHandlers(registry: LottieRegistry): void {
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.Ellipse, lottieEllipseShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.Fill, lottieFillShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.GradientFill, lottieGradientFillShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.GradientStroke, lottieGradientStrokeShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.Path, lottiePathShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.Polystar, lottiePolystarShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.Rectangle, lottieRectangleShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.Stroke, lottieStrokeShapeItemHandler);
  registerLottieShapeItemHandler(registry, LottieShapeItemKind.TrimPath, lottieTrimPathShapeItemHandler);
}

export const lottieAllShapeItemHandlers: readonly LottieShapeItemHandler[] = [
  lottieEllipseShapeItemHandler,
  lottieFillShapeItemHandler,
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
  lottiePathShapeItemHandler,
  lottiePolystarShapeItemHandler,
  lottieRectangleShapeItemHandler,
  lottieStrokeShapeItemHandler,
  lottieTrimPathShapeItemHandler,
];
