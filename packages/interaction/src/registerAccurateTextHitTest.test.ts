import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createTextLabel, setTextLabelString } from '@flighthq/text';
import { setTextLayoutMeasureProvider } from '@flighthq/textlayout';
import type { HitTestResult, TextLabel } from '@flighthq/types';
import { TextLabelKind } from '@flighthq/types';

import { findGraphHitTargetDetailed, hitTestGraphLocalBounds, registerHitTestPoint } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerAccurateTextHitTest } from './registerAccurateTextHitTest';

function hittableLabel(text: string): TextLabel {
  const label = createTextLabel();
  setTextLabelString(label, text);
  setRectangle(getNodeLocalBoundsRectangle(label), 0, 0, 200, 30);
  setNodeHitTestEnabled(label, true);
  return label;
}

function emptyResult(node: TextLabel): HitTestResult {
  return { localX: 0, localY: 0, node, subIndex: -99 };
}

beforeAll(() => {
  registerHitTestPoint(TextLabelKind, hitTestGraphLocalBounds);
  registerAccurateTextHitTest();
});

afterEach(() => {
  setTextLayoutMeasureProvider(null);
});

describe('registerAccurateTextHitTest', () => {
  it('resolves subIndex to -1 when no layout is available (no measure provider)', () => {
    setTextLayoutMeasureProvider(null);
    const label = hittableLabel('hello');
    const out = emptyResult(label);
    findGraphHitTargetDetailed(label, 5, 10, out);
    expect(out.node).toBe(label);
    expect(out.subIndex).toBe(-1);
  });

  it('resolves the character index under the pointer via the layout', () => {
    // Fixed 7px-per-character measure — a real layout without a renderer.
    setTextLayoutMeasureProvider((t) => t.length * 7);
    const label = hittableLabel('ABCDE');
    const left = emptyResult(label);
    const right = emptyResult(label);

    findGraphHitTargetDetailed(label, 1, 10, left);
    findGraphHitTargetDetailed(label, 30, 10, right);

    expect(left.subIndex).toBe(0);
    expect(right.subIndex).toBeGreaterThan(left.subIndex);
  });
});
