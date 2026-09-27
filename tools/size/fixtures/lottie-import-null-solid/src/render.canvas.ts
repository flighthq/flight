import {
  createScene2DFromLottieDocumentWithRegistry,
  lottieNullLayerHandler,
  lottieSolidLayerHandler,
} from '@flighthq/scene2d-formats/contract';
// The floor: transforms and one flat rectangle. No images, no text, no shape items — and so none of `@flighthq/text`,
// `@flighthq/texture`, the sprite, or the paint/path render stack.
// ★ THE SELECTIVE ENTRY IS `createScene2DFromLottieDocumentWithRegistry`, NOT `createScene2DFromLottieDocument`.
// The zero-config entry resolves `layerHandlers` from its own defaults, so it names all fifteen handlers whatever a
// caller passes in options — the same trap the COLLADA fixtures hit when they routed through `parseCollada`. Keeping
// that default is deliberate: asking for everything should cost everything.
// ★ AND THE CONTRACT LANE IS NOT A SHORTCUT — IT IS THE ONLY LANE THIS PATH HAS. `LottieRegistry` and the two
// `*Kind` tables live in `packages/types/src/LottieRegistry.ts`, which `types` publishes on `./contract` only, so a
// caller cannot name a layer kind through `@flighthq/types` at all. `LottieDocumentImportOptions.layerHandlers` is
// public and its element type is not, which makes the public option untypeable; that is a `types` lane question, not
// this package's, and it is reported rather than changed here.
import { LottieLayerKind } from '@flighthq/types/contract';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [
    { handle: lottieNullLayerHandler, kind: LottieLayerKind.Null },
    { handle: lottieSolidLayerHandler, kind: LottieLayerKind.Solid },
  ],
  shapeItemHandlers: [],
});
