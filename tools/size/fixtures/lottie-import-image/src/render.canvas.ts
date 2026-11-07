import { createScene2DFromLottieDocumentWithRegistry, lottieImageLayerHandler } from '@flighthq/scene2d-formats';
import { LottieLayerKind } from '@flighthq/scene2d-formats/contract';
// Images only: the sprite and texture path, with no text and no shape render stack.

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [{ handle: lottieImageLayerHandler, kind: LottieLayerKind.Image }],
  // No mask family: nothing in these subsets is masked, and declining it is what keeps `@flighthq/clip` and the
  // bezier path reader out of the bundle.
  maskHandlers: [],
  shapeItemHandlers: [],
});
