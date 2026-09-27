import {
  createScene2DFromLottieDocumentWithRegistry,
  lottieEllipseShapeItemHandler,
  lottieFillShapeItemHandler,
  lottieRectangleShapeItemHandler,
  lottieShapeLayerHandler,
} from '@flighthq/scene2d-formats/contract';
// Basic geometry: rectangles and ellipses under a flat fill. The shape layer brings the paint/path render stack, but
// naming no path, polystar, gradient, stroke or trim item leaves their readers — and the bezier, star and dash code
// behind them — out.
import { LottieLayerKind, LottieShapeItemKind } from '@flighthq/types/contract';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [{ handle: lottieShapeLayerHandler, kind: LottieLayerKind.Shape }],
  shapeItemHandlers: [
    { handle: lottieEllipseShapeItemHandler, kind: LottieShapeItemKind.Ellipse },
    { handle: lottieFillShapeItemHandler, kind: LottieShapeItemKind.Fill },
    { handle: lottieRectangleShapeItemHandler, kind: LottieShapeItemKind.Rectangle },
  ],
});
