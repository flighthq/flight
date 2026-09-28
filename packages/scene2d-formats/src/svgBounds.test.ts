import { getNodeChildAt } from '@flighthq/node/contract';
import type { Node2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromSvgDocument } from './svgImport.ts';

// Both exports take the import context or a built node, so the observable behaviour is whether an
// `objectBoundingBox` clip resolves — which is the one consumer that cannot proceed without a box.
describe('createSvgNode2DBounds', () => {
  it('measures a group of shapes, so a fractional clip over it resolves', () => {
    expect(
      firstChild(
        '<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath>',
        '<rect width="4" height="4"/>',
      ).clip,
    ).not.toBeNull();
  });
});

describe('hasUnmeasurableSvgText', () => {
  // ★ TEXT HAS NO BOX WITHOUT A SHAPER, AND A PARTIAL BOX IS WORSE THAN NONE. An `objectBoundingBox` clip is placed in a
  // 0..1 space over its target, so measuring a subtree containing a label at the label's default size would put a
  // valid-looking clip at the wrong coordinates. Measured: the same clip resolves over a rect and is declined over text.
  it('declines a fractional clip over a subtree containing text', () => {
    const clip = '<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1"/></clipPath>';
    expect(firstChild(clip, '<rect width="4" height="4"/>').clip).not.toBeNull();
    expect(firstChild(clip, '<text>hi</text>').clip).toBeNull();
  });

  // A clip in USER space needs no box, so the same text subtree clips normally — which is what shows the decline above
  // is about measurement rather than about text being unclippable.
  it('still clips a text subtree when the clip is in user space', () => {
    const clip = '<clipPath id="c"><rect width="2" height="2"/></clipPath>';
    expect(firstChild(clip, '<text>hi</text>').clip).not.toBeNull();
  });
});

function firstChild(defs: string, content: string): Node2D {
  const child = getNodeChildAt(
    createScene2DFromSvgDocument(`<svg>${defs}<g clip-path="url(#c)">${content}</g></svg>`),
    0,
  ) as Node2D | null;
  expect(child).not.toBeNull();
  return child!;
}
