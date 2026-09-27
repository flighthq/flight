import {
  createScene2DFromLottieDocumentWithRegistry,
  lottieNullLayerHandler,
  lottieSolidLayerHandler,
} from '@flighthq/scene2d-formats';
// The floor: transforms and one flat rectangle. No images, no text, no shape items — and so none of `@flighthq/text`,
// `@flighthq/texture`, the sprite, or the paint/path render stack.
// ★ THE SELECTIVE ENTRY IS `createScene2DFromLottieDocumentWithRegistry`, NOT `createScene2DFromLottieDocument`.
// The zero-config entry resolves `layerHandlers` from its own defaults, so it names all fifteen handlers whatever a
// caller passes in options — the same trap the COLLADA fixtures hit when they routed through `parseCollada`. Keeping
// that default is deliberate: asking for everything should cost everything.
// ★ AND THIS FIXTURE NAMES ONLY PUBLIC LANES. The selective entry, two handlers and a kind table all come from `.`, so
// a name that left the public lane fails the build here. It proves the NAMES resolve, not the types: these fixtures are
// bundled, never typechecked. The typed half is `createScene2DFromLottieDocumentWithRegistry`'s own test, which builds a
// `LottieRegistry` out of `@flighthq/types` under tsc. Both halves are needed, because
// `packages/types/src/LottieRegistry.ts` was contract-only while `LottieDocumentImportOptions.layerHandlers` was
// already public — a public option whose element type no application could name.
import { LottieLayerKind } from '@flighthq/types';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [
    { handle: lottieNullLayerHandler, kind: LottieLayerKind.Null },
    { handle: lottieSolidLayerHandler, kind: LottieLayerKind.Solid },
  ],
  // No mask family: nothing in these subsets is masked, and declining it is what keeps `@flighthq/clip` and the
  // bezier path reader out of the bundle.
  maskHandlers: [],
  shapeItemHandlers: [],
});
