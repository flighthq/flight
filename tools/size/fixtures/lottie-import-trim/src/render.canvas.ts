// Basic geometry plus the trim path: the post-walk modifier, and the path dashing and measuring behind it.
// ★ THIS FIXTURE IS `lottie-import-geometry` PLUS ONE MODIFIER FAMILY, and nothing else. While the trimming lived in the
// shape layer it ran off the item list directly, so `dashPath` and `getPathLength` were in every shape-layer build and a
// caller who declined this item was trimmed anyway. The difference between the two bundles is now what registering it
// costs.
import {
  createScene2DFromLottieDocumentWithRegistry,
  lottieEllipseShapeItemHandler,
  lottieFillShapeItemHandler,
  lottieRectangleShapeItemHandler,
  lottieShapeLayerHandler,
  lottieTrimPathShapeItemHandler,
} from '@flighthq/scene2d-formats';
import { LottieLayerKind, LottieShapeItemKind } from '@flighthq/types';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [{ handle: lottieShapeLayerHandler, kind: LottieLayerKind.Shape }],
  maskHandlers: [],
  shapeItemHandlers: [
    { handle: lottieEllipseShapeItemHandler, kind: LottieShapeItemKind.Ellipse },
    { handle: lottieFillShapeItemHandler, kind: LottieShapeItemKind.Fill },
    { handle: lottieRectangleShapeItemHandler, kind: LottieShapeItemKind.Rectangle },
    { handle: lottieTrimPathShapeItemHandler, kind: LottieShapeItemKind.TrimPath },
  ],
});
