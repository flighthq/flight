import { createScene2DFromLottieDocumentWithRegistry, lottieTextLayerHandler } from '@flighthq/scene2d-formats';
import { LottieLayerKind } from '@flighthq/scene2d-formats/contract';
// Text only: the label and its format, with no sprite, no texture and no shape render stack.

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [{ handle: lottieTextLayerHandler, kind: LottieLayerKind.Text }],
  // No mask family: nothing in these subsets is masked, and declining it is what keeps `@flighthq/clip` and the
  // bezier path reader out of the bundle.
  maskHandlers: [],
  shapeItemHandlers: [],
});
