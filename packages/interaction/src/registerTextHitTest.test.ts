import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createTextLabel, setTextLabelString } from '@flighthq/text';
import { setTextLayoutMeasureProvider } from '@flighthq/textlayout';
import type { HitTestResult, TextLabel } from '@flighthq/types';
import { TextLabelKind } from '@flighthq/types';

import { describeGraphHit, findGraphHitTargetPrecise, hitTestGraphLocalBounds, registerHitTest } from './hitTests';
import { setNodeHitTestEnabled } from './nodeInteractionState';
import { registerTextHitTest } from './registerTextHitTest';

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
  registerHitTest(TextLabelKind, hitTestGraphLocalBounds);
  registerTextHitTest();
});

afterEach(() => {
  setTextLayoutMeasureProvider(null);
});

describe('registerTextHitTest', () => {
  it('hits the whole box precisely, and describes subIndex 0 when no layout is available', () => {
    setTextLayoutMeasureProvider(null);
    const label = hittableLabel('hello');
    expect(findGraphHitTargetPrecise(label, 5, 10)).toBe(label);
    const out = emptyResult(label);
    describeGraphHit(label, 5, 10, out);
    expect(out.subIndex).toBe(0);
  });

  it('describes the character index under the pointer via the layout', () => {
    // Fixed 7px-per-character measure — a real layout without a renderer.
    setTextLayoutMeasureProvider((t) => t.length * 7);
    const label = hittableLabel('ABCDE');
    const left = emptyResult(label);
    const right = emptyResult(label);
    describeGraphHit(label, 1, 10, left);
    describeGraphHit(label, 30, 10, right);
    expect(left.subIndex).toBe(0);
    expect(right.subIndex).toBeGreaterThan(left.subIndex);
  });
});
