import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { LottieDocument, LottieLayer, Node2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { registerAllLottieHandlers } from './lottieHandlers.ts';
import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { createLottieRegistry } from './lottieRegistry.ts';
import { createLottieTestDocument, findLottieTestNodeByName, lottieTestShapeLayer } from './lottieTestFixtures.ts';

// ★ MOVED, NOT REWRITTEN. These assertions lived beside eight other handlers' while this one's interpretation was a
// one-line shim into the document core. They are unchanged: the point of the move is locality, and editing them at
// the same time would make a behaviour change indistinguishable from a relocation.

describe('createScene2DFromLottieDocument', () => {
  it('returns the display subtree and target-bound clip', () => {
    const result = createScene2DFromLottieDocument(createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]));
    expect(findLottieTestNodeByName(result.root, 'shape')).not.toBeNull();
    expect(result.clip.duration).toBe(2);
  });

  it('produces identical output with registry-populated handlers and zero-config defaults', () => {
    const doc = createLottieTestDocument([
      lottieTestShapeLayer(1, 'shape'),
      { ind: 2, ip: 0, nm: 'null', op: 60, ty: 3 },
      { ind: 3, ip: 0, nm: 'solid', op: 60, sc: '#ff0000', sh: 50, sw: 50, ty: 1 },
    ]);
    const defaultResult = createScene2DFromLottieDocument(doc);
    const registry = createLottieRegistry();
    registerAllLottieHandlers(registry);
    const registryResult = createScene2DFromLottieDocument(doc, undefined, {
      layerHandlers: registry.layerHandlers,
      shapeItemHandlers: registry.shapeItemHandlers,
    });
    expect(JSON.parse(JSON.stringify(registryResult))).toEqual(JSON.parse(JSON.stringify(defaultResult)));
  });

  it('produces empty layer containers when no handlers are registered', () => {
    const doc = createLottieTestDocument([lottieTestShapeLayer(1, 'shape')]);
    const defaultResult = createScene2DFromLottieDocument(doc);
    const emptyResult = createScene2DFromLottieDocument(doc, undefined, {
      layerHandlers: [],
      shapeItemHandlers: [],
    });
    expect(getNodeChildCount(emptyResult.root)).toBe(1);
    expect(getNodeChildCount(getNodeChildAt(emptyResult.root, 0)!)).toBe(0);
    expect(getNodeChildCount(getNodeChildAt(defaultResult.root, 0)!)).toBeGreaterThan(0);
  });
});
