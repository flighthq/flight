import type { LottieLayer } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { createLottieTestDocument, lottieTestSquarePath } from './lottieTestFixtures.ts';

describe('appendLottieShapePathChannels', () => {
  // ★ MOVED OUT OF THE CORE'S TEST WITH THE FUNCTION. It has two owners — the path shape item and the additive mask —
  // and the core has neither, which is why it stopped being the core's. The assertion is unchanged: it goes through the
  // importer rather than calling the builder bare, since its inputs are the core's own keyframe shapes.
  it('produces a channel for an animated path so the clip drives the rebuild', () => {
    const document = createLottieTestDocument([
      {
        ind: 1,
        ip: 0,
        ks: {},
        nm: 'animated',
        op: 60,
        shapes: [
          { d: 1, ks: { a: 1, k: animatedPathKeyframes() }, nm: 'p', ty: 'sh' },
          { c: { a: 0, k: [1, 0, 0] }, nm: 'f', o: { a: 0, k: 100 }, ty: 'fl' },
        ],
        st: 0,
        ty: 4,
      } as unknown as LottieLayer,
    ]);
    const result = createScene2DFromLottieDocument(document);
    expect(result.clip.channels.length).toBeGreaterThan(0);
  });
});

function animatedPathKeyframes() {
  return [
    { s: [lottieTestSquarePath(0, 0, 10)], t: 0 },
    { s: [lottieTestSquarePath(0, 0, 20)], t: 30 },
  ];
}
