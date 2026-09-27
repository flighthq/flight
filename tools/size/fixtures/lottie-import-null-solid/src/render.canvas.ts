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
// ★ AND THIS FIXTURE IS THE PROOF THE PUBLIC LANE IS ENOUGH. It names the selective entry, two handlers and a kind
// table, all from `.` — no `/contract` anywhere — so if any of them left the public lane the build would fail here
// rather than in a reviewer's head. `packages/types/src/LottieRegistry.ts` used to be contract-only, which made
// `LottieDocumentImportOptions.layerHandlers` a public option with a private element type.
import { LottieLayerKind } from '@flighthq/types';

export const result = createScene2DFromLottieDocumentWithRegistry('{}', {
  layerHandlers: [
    { handle: lottieNullLayerHandler, kind: LottieLayerKind.Null },
    { handle: lottieSolidLayerHandler, kind: LottieLayerKind.Solid },
  ],
  shapeItemHandlers: [],
});
