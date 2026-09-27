import { createScene2DFromLottieDocumentWithRegistry, lottieTextLayerHandler } from '@flighthq/scene2d-formats';
// Text only: the label and its format, with no sprite, no texture and no shape render stack.
import { LottieLayerKind } from '@flighthq/types';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [{ handle: lottieTextLayerHandler, kind: LottieLayerKind.Text }],
  shapeItemHandlers: [],
});
