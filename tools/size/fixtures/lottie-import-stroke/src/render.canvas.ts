// Basic geometry plus the solid stroke: the line style builder and the dashed path appender behind it.
// ★ THIS FIXTURE IS `lottie-import-geometry` PLUS ONE PAINT FAMILY, and nothing else. The pair prices that family on
// its own: each paint's drawing now travels with the item that produces it, so the difference between the two bundles
// is exactly what registering this one costs. While the shape layer held a `switch (paint.kind)`, the difference would
// have been a handler shim — tens of bytes — because every builder was already linked.
import {
  createScene2DFromLottieDocumentWithRegistry,
  lottieEllipseShapeItemHandler,
  lottieFillShapeItemHandler,
  lottieRectangleShapeItemHandler,
  lottieShapeLayerHandler,
  lottieStrokeShapeItemHandler,
} from '@flighthq/scene2d-formats';
import { LottieLayerKind, LottieShapeItemKind } from '@flighthq/types';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [{ handle: lottieShapeLayerHandler, kind: LottieLayerKind.Shape }],
  maskHandlers: [],
  shapeItemHandlers: [
    { handle: lottieEllipseShapeItemHandler, kind: LottieShapeItemKind.Ellipse },
    { handle: lottieFillShapeItemHandler, kind: LottieShapeItemKind.Fill },
    { handle: lottieRectangleShapeItemHandler, kind: LottieShapeItemKind.Rectangle },
    { handle: lottieStrokeShapeItemHandler, kind: LottieShapeItemKind.Stroke },
  ],
});
