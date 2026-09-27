import type { LottieRegistry, LottieShapeItemHandler } from '@flighthq/types/contract';
import { LottieShapeItemKind } from '@flighthq/types/contract';

import { lottieEllipseShapeItemHandler } from './lottieEllipseShapeItem.ts';
import { lottieFillShapeItemHandler } from './lottieFillShapeItem.ts';
import {
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
} from './lottieGradientShapeItems.ts';
import { lottiePathShapeItemHandler } from './lottiePathShapeItem.ts';
import { lottiePolystarShapeItemHandler } from './lottiePolystarShapeItem.ts';
import { lottieRectangleShapeItemHandler } from './lottieRectangleShapeItem.ts';
import { registerLottieShapeItemHandler } from './lottieRegistry.ts';
import { lottieStrokeShapeItemHandler } from './lottieStrokeShapeItem.ts';
import { lottieTrimPathShapeItemHandler } from './lottieTrimPathShapeItem.ts';

/**
 * The shape-item family: every handler Flight reads a Lottie shape with, and the registrar that installs them all.
 *
 * ★ THIS FILE IS THE PRESET AND NOTHING ELSE. Each handler now lives in the module that owns its interpretation, and
 * this one only names them — so a caller who imports one handler links one handler, while importing THIS module
 * links all nine. That split is the whole reason the handlers moved out: this file used to hold nine one-line shims
 * into readers retained in the 1,800-line document core, which meant naming any handler linked every one of them
 * plus the core's private path, gradient and stroke code.
 *
 * Nothing here registers itself. A handler is a plain function; importing one starts nothing, and
 * `registerLottieShapeItemHandlers` is the explicit step a zero-config caller takes.
 */
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
