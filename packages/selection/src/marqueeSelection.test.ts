import { createNode, createNodeRuntime, initBoundsRectangleRuntimeTrait } from '@flighthq/node/contract';
import type { BoundsNodeAny, HasBoundsRectangleRuntime, NodeRuntime, RectangleLike } from '@flighthq/types/contract';

import {
  beginMarqueeSelection,
  createMarqueeSelection,
  endMarqueeSelection,
  findNodesInMarqueeSelection,
  getMarqueeRectangle,
  updateMarqueeSelection,
} from './index';

describe('beginMarqueeSelection', () => {
  it('starts a new zero-area rectangle at the pointer location', () => {
    const marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 10, 20);

    expect(getMarqueeRectangle(marquee)).toMatchObject({ x: 10, y: 20, width: 0, height: 0 });
  });
});

describe('createMarqueeSelection', () => {
  it('creates an inactive marquee with an empty rectangle', () => {
    const marquee = createMarqueeSelection();

    updateMarqueeSelection(marquee, 100, 100);
    expect(getMarqueeRectangle(marquee)).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('endMarqueeSelection', () => {
  it('returns the live rectangle and makes later updates inert', () => {
    const marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 1, 2);
    updateMarqueeSelection(marquee, 3, 4);

    const rectangle = endMarqueeSelection(marquee);
    updateMarqueeSelection(marquee, 50, 50);

    expect(rectangle).toBe(getMarqueeRectangle(marquee));
    expect(rectangle).toMatchObject({ x: 1, y: 2, width: 2, height: 2 });
  });
});

describe('findNodesInMarqueeSelection', () => {
  it('finds intersecting or fully contained bounds in caller order', () => {
    const marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 0, 0);
    updateMarqueeSelection(marquee, 10, 10);
    const contained = createBoundedNode('contained', { x: 2, y: 2, width: 2, height: 2 });
    const overlapping = createBoundedNode('overlapping', { x: 8, y: 8, width: 5, height: 5 });
    const outside = createBoundedNode('outside', { x: 20, y: 20, width: 1, height: 1 });

    expect(findNodesInMarqueeSelection(marquee, [overlapping, outside, contained])).toEqual([overlapping, contained]);
    expect(findNodesInMarqueeSelection(marquee, [overlapping, outside, contained], 'contain')).toEqual([contained]);
  });
});

describe('getMarqueeRectangle', () => {
  it('exposes the same rectangle throughout a gesture', () => {
    const marquee = createMarqueeSelection();
    const rectangle = getMarqueeRectangle(marquee);

    beginMarqueeSelection(marquee, 4, 5);

    expect(getMarqueeRectangle(marquee)).toBe(rectangle);
  });
});

describe('updateMarqueeSelection', () => {
  it('normalizes a reverse drag into positive rectangle dimensions', () => {
    const marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 10, 20);

    updateMarqueeSelection(marquee, 2, 5);

    expect(getMarqueeRectangle(marquee)).toMatchObject({ x: 2, y: 5, width: 8, height: 15 });
  });
});

function createBoundedNode(name: string, rectangle: Readonly<RectangleLike>): BoundsNodeAny {
  return createNode('SelectionBoundsTestNode', { name }, undefined, () => {
    const runtime = createNodeRuntime() as NodeRuntime & HasBoundsRectangleRuntime;
    initBoundsRectangleRuntimeTrait(runtime, {
      computeLocalBoundsRectangle(out) {
        out.x = rectangle.x;
        out.y = rectangle.y;
        out.width = rectangle.width;
        out.height = rectangle.height;
      },
    });
    return runtime;
  }) as BoundsNodeAny;
}
