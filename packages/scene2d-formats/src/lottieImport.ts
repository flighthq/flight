import type {
  ImportDiagnostic,
  LottieDocument,
  LottieDocumentImportOptions,
  LottieDocumentImportResult,
  LottieLayerHandlerEntry,
  LottieMaskHandlerEntry,
  LottieShapeItemHandlerEntry,
} from '@flighthq/types/contract';
import { LottieLayerKind, LottieMaskKind, LottieShapeItemKind } from '@flighthq/types/contract';

import { createScene2DFromLottieDocumentWithRegistry } from './lottieDocument.ts';
import { lottieEllipseShapeItemHandler } from './lottieEllipseShapeItem.ts';
import { lottieFillShapeItemHandler } from './lottieFillShapeItem.ts';
import {
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
} from './lottieGradientShapeItems.ts';
import { lottieImageLayerHandler } from './lottieImageLayer.ts';
import { lottieAdditiveMaskHandler } from './lottieMask.ts';
import { lottieNullLayerHandler } from './lottieNullLayer.ts';
import { lottiePathShapeItemHandler } from './lottiePathShapeItem.ts';
import { lottiePolystarShapeItemHandler } from './lottiePolystarShapeItem.ts';
import { lottiePrecompositionLayerHandler } from './lottiePrecompositionLayer.ts';
import { lottieRectangleShapeItemHandler } from './lottieRectangleShapeItem.ts';
import { lottieShapeLayerHandler } from './lottieShapeLayer.ts';
import { lottieSolidLayerHandler } from './lottieSolidLayer.ts';
import { lottieStrokeShapeItemHandler } from './lottieStrokeShapeItem.ts';
import { lottieTextLayerHandler } from './lottieTextLayer.ts';
import { lottieTrimPathShapeItemHandler } from './lottieTrimPathShapeItem.ts';

/**
 * Reads a Lottie document into a scene, with every layer and shape item Flight supports unless the caller names
 * fewer.
 *
 * ★ THIS MODULE EXISTS TO OWN THE DEFAULT, AND NOTHING ELSE. `createScene2DFromLottieDocumentWithRegistry` does the
 * work and takes the registry as an argument; resolving `undefined` to the full family is the one thing that cannot
 * live there, because naming fifteen handlers from the orchestrator would put the path, polystar, gradient, text and
 * image code into the module graph of every caller — including the caller who asked for null and solid layers only.
 *
 * Behaviour is unchanged for every existing caller: `createScene2DFromLottieDocument(source)` reads what it always
 * read, in the order it always read it, and the `layerHandlers` / `shapeItemHandlers` options narrow exactly as
 * before.
 */
export function createScene2DFromLottieDocument(
  source: string | Readonly<LottieDocument>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<LottieDocumentImportOptions>,
): LottieDocumentImportResult {
  return createScene2DFromLottieDocumentWithRegistry(
    source,
    {
      layerHandlers: options?.layerHandlers ?? defaultLottieLayerHandlers(),
      maskHandlers: options?.maskHandlers ?? defaultLottieMaskHandlers(),
      shapeItemHandlers: options?.shapeItemHandlers ?? defaultLottieShapeItemHandlers(),
    },
    diagnostics,
    options,
  );
}

// The zero-config layer family, in the order the single function registered it.
function defaultLottieLayerHandlers(): LottieLayerHandlerEntry[] {
  return [
    { handle: lottiePrecompositionLayerHandler, kind: LottieLayerKind.Precomposition },
    { handle: lottieSolidLayerHandler, kind: LottieLayerKind.Solid },
    { handle: lottieImageLayerHandler, kind: LottieLayerKind.Image },
    { handle: lottieNullLayerHandler, kind: LottieLayerKind.Null },
    { handle: lottieShapeLayerHandler, kind: LottieLayerKind.Shape },
    { handle: lottieTextLayerHandler, kind: LottieLayerKind.Text },
  ];
}

// The zero-config mask family, likewise.
function defaultLottieMaskHandlers(): LottieMaskHandlerEntry[] {
  return [{ handle: lottieAdditiveMaskHandler, kind: LottieMaskKind.Additive }];
}

// The zero-config shape-item family, likewise.
function defaultLottieShapeItemHandlers(): LottieShapeItemHandlerEntry[] {
  return [
    { handle: lottieEllipseShapeItemHandler, kind: LottieShapeItemKind.Ellipse },
    { handle: lottieFillShapeItemHandler, kind: LottieShapeItemKind.Fill },
    { handle: lottieGradientFillShapeItemHandler, kind: LottieShapeItemKind.GradientFill },
    { handle: lottieGradientStrokeShapeItemHandler, kind: LottieShapeItemKind.GradientStroke },
    { handle: lottiePathShapeItemHandler, kind: LottieShapeItemKind.Path },
    { handle: lottiePolystarShapeItemHandler, kind: LottieShapeItemKind.Polystar },
    { handle: lottieRectangleShapeItemHandler, kind: LottieShapeItemKind.Rectangle },
    { handle: lottieStrokeShapeItemHandler, kind: LottieShapeItemKind.Stroke },
    { handle: lottieTrimPathShapeItemHandler, kind: LottieShapeItemKind.TrimPath },
  ];
}
