import { createRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { appendPathLineTo, appendPathMoveTo, createPath, createPathMorph } from '@flighthq/path/contract';
import { createMorphShape, setMorphShapeProgress } from '@flighthq/shape/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { MorphShape, Node2D, Rectangle } from '@flighthq/types/contract';
import { MovieClipKind, SpriteKind } from '@flighthq/types/contract';

import {
  applySwfAuthoredBounds,
  applySwfMorphBounds,
  computeSwfLocalBoundsRectangle,
  createSwfDisplayObject,
  createSwfMorphShapeTarget,
  createSwfMovieClip,
  createSwfTexturedSprite,
} from './swfNode';

describe('applySwfAuthoredBounds', () => {
  // A SWF sizes a character by the RECT the tool recorded — stroke width and authoring padding included —
  // rather than by the geometry inside it, so the authored box is what layout is measured against.
  it('makes the node report the authored box rather than its own content', () => {
    const node = createSwfDisplayObject(null);
    applySwfAuthoredBounds(node, { height: 4, width: 8, x: 1, y: 2 });
    expect(localBounds(node)).toMatchObject({ height: 4, width: 8, x: 1, y: 2 });
  });

  it('copies the box rather than aliasing what the caller passed', () => {
    const bounds = { height: 4, width: 8, x: 0, y: 0 };
    const node = createSwfDisplayObject(null);
    applySwfAuthoredBounds(node, bounds);
    bounds.width = 999;
    expect(localBounds(node)!.width).toBe(8);
  });

  // A character the file gave no extent keeps the graph's own measurement: nothing is pinned, and the
  // node reports whatever its content does.
  it('installs nothing when there is no authored box', () => {
    const node = createSwfDisplayObject(null);
    applySwfAuthoredBounds(node, null);
    expect(node.data).toBeNull();
  });
});

describe('applySwfMorphBounds', () => {
  it('interpolates the authored box between the two endpoints', () => {
    const shape = morphWithBounds();
    applySwfMorphBounds(shape, 0.5);
    expect(localBounds(shape)).toMatchObject({ height: 15, width: 15, x: 5, y: 5 });
  });

  it('reports each endpoint exactly at the ends of the range', () => {
    const shape = morphWithBounds();
    applySwfMorphBounds(shape, 0);
    expect(localBounds(shape)).toMatchObject({ height: 10, width: 10, x: 0, y: 0 });
    applySwfMorphBounds(shape, 1);
    expect(localBounds(shape)).toMatchObject({ height: 20, width: 20, x: 10, y: 10 });
  });

  // A morph placed without endpoint boxes keeps whatever extent it has; there is nothing to move.
  it('leaves a shape with no endpoints alone', () => {
    const shape = createSegmentMorphShape();
    expect(() => applySwfMorphBounds(shape, 0.5)).not.toThrow();
  });
});

describe('computeSwfLocalBoundsRectangle', () => {
  it('writes the authored box of the node into the out parameter', () => {
    const node = createSwfDisplayObject({ height: 4, width: 8, x: 1, y: 2 });
    const out = createRectangle();
    computeSwfLocalBoundsRectangle(out, node);
    expect(out).toMatchObject({ height: 4, width: 8, x: 1, y: 2 });
  });

  // The box is read through the hook rather than copied out of it, which is what lets a morph's extent
  // move with its ratio without anything re-reading the node.
  it('reports the box currently on the node, not the one it was installed with', () => {
    const node = createSwfDisplayObject({ height: 4, width: 8, x: 0, y: 0 });
    applySwfAuthoredBounds(node, { height: 40, width: 80, x: 0, y: 0 });
    const out = createRectangle();
    computeSwfLocalBoundsRectangle(out, node);
    expect(out).toMatchObject({ height: 40, width: 80 });
  });
});

describe('createSwfDisplayObject', () => {
  it('produces the bounded container a placement with no visual definition still needs', () => {
    expect(localBounds(createSwfDisplayObject({ height: 4, width: 8, x: 0, y: 0 }))).toMatchObject({
      height: 4,
      width: 8,
    });
  });
});

describe('createSwfMorphShapeTarget', () => {
  it('uses the decoded shape and sizes it from the start endpoint', () => {
    const decoded = createSegmentMorphShape();
    const target = createSwfMorphShapeTarget(() => decoded, null, {
      end: { height: 20, width: 20, x: 0, y: 0 },
      start: { height: 10, width: 10, x: 0, y: 0 },
    });
    expect(target).toBe(decoded);
    // A morph at rest reports the box it actually occupies, not the union of both endpoints — a union
    // would report room for the shape it is not yet.
    expect(localBounds(target)).toMatchObject({ height: 10, width: 10 });
  });

  // A factory that declines leaves an empty display object, so the placement keeps its box and its slot
  // reference rather than vanishing from the document.
  it('falls back to a bounded container when the factory declines', () => {
    const target = createSwfMorphShapeTarget(() => null, { height: 4, width: 8, x: 0, y: 0 }, undefined);
    expect(target.kind).not.toBe(MovieClipKind);
    expect(localBounds(target)).toMatchObject({ height: 4, width: 8 });
  });

  it('applies the placement extent when the definition declared no endpoints', () => {
    const decoded = createSegmentMorphShape();
    const target = createSwfMorphShapeTarget(() => decoded, { height: 6, width: 6, x: 0, y: 0 }, undefined);
    expect(localBounds(target)).toMatchObject({ height: 6, width: 6 });
  });
});

describe('createSwfMovieClip', () => {
  it('produces a clip carrying the authored extent of its symbol', () => {
    const clip = createSwfMovieClip({ height: 4, width: 8, x: 0, y: 0 });
    expect(clip.kind).toBe(MovieClipKind);
    expect(localBounds(clip)).toMatchObject({ height: 4, width: 8 });
  });
});

describe('createSwfTexturedSprite', () => {
  it('samples the texture it is given', () => {
    const texture = createTexture({});
    const sprite = createSwfTexturedSprite(texture, null);
    expect(sprite.kind).toBe(SpriteKind);
    expect(sprite.data.texture).toBe(texture);
  });

  // The authored RECT sizes the node before the image resolves, so layout does not shift when pixels
  // arrive and a document that never loads its images still measures correctly.
  it('reports the authored extent before any pixels exist', () => {
    const sprite = createSwfTexturedSprite(createTexture({}), { height: 4, width: 8, x: 0, y: 0 });
    expect(localBounds(sprite)).toMatchObject({ height: 4, width: 8 });
  });
});

function localBounds(node: Node2D): Readonly<Rectangle> {
  return getNodeLocalBoundsRectangle(node);
}

function morphWithBounds(): MorphShape {
  const shape = createSwfMorphShapeTarget(() => createSegmentMorphShape(), null, {
    end: { height: 20, width: 20, x: 10, y: 10 },
    start: { height: 10, width: 10, x: 0, y: 0 },
  }) as MorphShape;
  setMorphShapeProgress(shape, 0);
  return shape;
}

// The smallest real morph: one segment moving, which is what gives the shape two endpoints to move
// between without the fixture carrying geometry the assertions do not look at.
function createSegmentMorphShape(): MorphShape {
  const start = createPath();
  appendPathMoveTo(start, 0, 0);
  appendPathLineTo(start, 10, 0);
  const end = createPath();
  appendPathMoveTo(end, 0, 0);
  appendPathLineTo(end, 20, 0);
  return createMorphShape(createPathMorph(start, end)!);
}
