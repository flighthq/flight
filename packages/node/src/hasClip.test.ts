import type { ClipRegion, HasClip } from '@flighthq/types';

import { initClipTrait } from './hasClip';
import { createNode } from './node';

const TestKind: unique symbol = Symbol('Test');

function makeTarget(): HasClip {
  return createNode(TestKind) as unknown as HasClip;
}

describe('initClipTrait', () => {
  it('defaults clip to null', () => {
    const target = makeTarget();
    initClipTrait(target);

    expect(target.clip).toBeNull();
  });

  it('applies a clip override', () => {
    const clip = { contours: null, rect: { height: 4, width: 3, x: 1, y: 2 }, version: 0 } as ClipRegion;
    const target = makeTarget();
    initClipTrait(target, { clip });

    expect(target.clip).toBe(clip);
  });
});
