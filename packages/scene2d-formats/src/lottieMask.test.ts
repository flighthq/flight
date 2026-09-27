import type { LottieLayer, LottieMaskHandler } from '@flighthq/types/contract';
import { LottieMaskKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { lottieAdditiveMaskHandler } from './lottieMask.ts';
import { registerLottieMaskHandlers } from './lottieMaskHandlers.ts';
import { createLottieRegistry, getLottieMaskHandler } from './lottieRegistry.ts';
import { createLottieTestDocument, findLottieTestNodeByName, lottieTestSquarePath } from './lottieTestFixtures.ts';

function expectRegisteredMask(kind: string, handler: LottieMaskHandler): void {
  const registry = createLottieRegistry();
  registerLottieMaskHandlers(registry);
  expect(getLottieMaskHandler(registry, kind)).toBe(handler);
}

describe('lottieAdditiveMaskHandler', () => {
  it('is the built-in Additive mask handler', () => {
    expectRegisteredMask(LottieMaskKind.Additive, lottieAdditiveMaskHandler);
  });

  it('lowers a lone additive mask onto a clip region', () => {
    const result = createScene2DFromLottieDocument(createLottieTestDocument([maskedLayer()]));
    expect(findLottieTestNodeByName(result.root, 'masked')?.clip).not.toBeNull();
  });

  // ★ THE THREE DECLINES ARE THE HANDLER'S OWN JUDGEMENT, NOT THE WALK'S. Flight's ClipRegion is one hard path, so a
  // composed pair, an inverted mask and an unreadable outline all leave the layer UNMASKED rather than wrongly masked
  // — and silently, because every idiomatic export carrying one would otherwise crumb on every import.
  // agents/scene2d-format-coverage.md is where the gap is recorded.
  it.each([
    ['a second active mask', (layer: LottieLayer) => layer.masksProperties?.push(secondMask())],
    ['inversion', (layer: LottieLayer) => void (layer.masksProperties![0].inv = true)],
    ['an absent outline', (layer: LottieLayer) => void (layer.masksProperties![0].pt = { k: undefined as never })],
  ])('declines %s, leaving the layer unmasked', (_name, mutate) => {
    const layer = maskedLayer();
    mutate(layer);
    const result = createScene2DFromLottieDocument(createLottieTestDocument([layer]));
    expect(findLottieTestNodeByName(result.root, 'masked')?.clip).toBeNull();
  });
});

function maskedLayer(): LottieLayer {
  return {
    ind: 1,
    ip: 0,
    masksProperties: [{ mode: 'a', o: { k: 100 }, pt: { k: lottieTestSquarePath(0, 0, 10) } }],
    nm: 'masked',
    op: 60,
    ty: 3,
  };
}

function secondMask() {
  return { mode: 'a' as const, o: { k: 100 }, pt: { k: lottieTestSquarePath(2, 2, 4) } };
}
