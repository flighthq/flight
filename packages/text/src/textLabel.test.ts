import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRevision, getNodeLocalContentRevision, getNodeLocalTransformRevision } from '@flighthq/node';
import { setTextLayoutMeasureProvider } from '@flighthq/textlayout';
import type { Node, PartialNode, TextLabel } from '@flighthq/types';
import { TextLabelKind } from '@flighthq/types';

import {
  appendTextLabelString,
  computeTextLabelLocalBoundsRectangle,
  createTextLabel,
  createTextLabelData,
  createTextLabelRuntime,
  getTextLabelFormat,
  getTextLabelRuntime,
  getTextLabelString,
  invalidateTextLabel,
  setTextLabelAutoSize,
  setTextLabelFormat,
  setTextLabelHeight,
  setTextLabelString,
  setTextLabelVerticalAlign,
  setTextLabelWidth,
} from './textLabel';

describe('appendTextLabelString', () => {
  it('appends the value to the existing text', () => {
    const text = createTextLabel({ data: { text: 'hello' } });
    appendTextLabelString(text, ' world');
    expect(text.data.text).toBe('hello world');
  });

  it('invalidates local content after append', () => {
    const text = createTextLabel({ data: { text: 'hi' } });
    const content = getNodeLocalContentRevision(text);
    appendTextLabelString(text, '!');
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
  });

  it('does not invalidate when value is empty', () => {
    const text = createTextLabel({ data: { text: 'hi' } });
    const content = getNodeLocalContentRevision(text);
    appendTextLabelString(text, '');
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('computeTextLabelLocalBoundsRectangle', () => {
  afterEach(() => {
    setTextLayoutMeasureProvider(null);
  });

  it('sets out dimensions from data width and height when autoSize is none', () => {
    const text = createTextLabel({ data: { width: 200, height: 50 } });
    const out = createRectangle();
    computeTextLabelLocalBoundsRectangle(out, text as unknown as Node);
    expect(out.x).toBe(0);
    expect(out.width).toBe(200);
    expect(out.height).toBe(50);
  });

  it('grows to the measured single run under autoSize left, anchored at the origin', () => {
    setTextLayoutMeasureProvider((value) => value.length * 7);
    const text = createTextLabel({ data: { autoSize: 'left', width: 200, height: 50 } });
    setTextLabelString(text, 'hi');
    const out = createRectangle();
    computeTextLabelLocalBoundsRectangle(out, text as unknown as Node);
    expect(out.x).toBe(0);
    expect(out.width).toBeGreaterThan(0);
    expect(out.width).toBeLessThan(200);
  });

  it('falls back to the fixed box under autoSize when no measure provider exists', () => {
    const text = createTextLabel({ data: { autoSize: 'left', width: 200, height: 50 } });
    setTextLabelString(text, 'hi');
    const out = createRectangle();
    computeTextLabelLocalBoundsRectangle(out, text as unknown as Node);
    expect(out.width).toBe(200);
    expect(out.height).toBe(50);
  });
});

describe('createTextLabel', () => {
  let text: TextLabel;

  beforeEach(() => {
    text = createTextLabel();
  });

  it('initializes default values', () => {
    expect(text.data.text).toBe('');
    expect(text.data.autoSize).toBe('none');
    expect(text.data.width).toBe(100);
    expect(text.data.height).toBe(100);
    expect(text.data.textFormat).not.toBeNull();
    expect(text.kind).toStrictEqual(TextLabelKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<TextLabel> = {
      data: {
        autoSize: 'left',
        text: 'foo',
        width: 300,
        height: 40,
      },
    };
    const obj = createTextLabel(base);
    expect(obj.data.autoSize).toStrictEqual(base.data!.autoSize);
    expect(obj.data.text).toStrictEqual(base.data!.text);
    expect(obj.data.width).toBe(300);
    expect(obj.data.height).toBe(40);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextLabel(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createTextLabelData', () => {
  it('returns default values', () => {
    const data = createTextLabelData();
    expect(data.autoSize).toBe('none');
    expect(data.height).toBe(100);
    expect(data.text).toBe('');
    expect(data.textFormat).not.toBeNull();
    expect(data.width).toBe(100);
  });

  it('allows pre-defined values', () => {
    const data = createTextLabelData({ autoSize: 'left', text: 'hello', width: 250, height: 30 });
    expect(data.autoSize).toBe('left');
    expect(data.text).toBe('hello');
    expect(data.width).toBe(250);
    expect(data.height).toBe(30);
  });
});

describe('createTextLabelRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createTextLabelRuntime();
    expect(runtime).not.toBeNull();
  });

  it('starts without attached layout runtime state', () => {
    const runtime = createTextLabelRuntime();
    expect(runtime.textLayout).toBeNull();
  });

  it('uses computeTextLabelLocalBoundsRectangle', () => {
    const runtime = createTextLabelRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeTextLabelLocalBoundsRectangle);
  });
});

describe('getTextLabelFormat', () => {
  it('returns the textFormat field', () => {
    const format = { size: 24, bold: true };
    const text = createTextLabel({ data: { textFormat: format } });
    expect(getTextLabelFormat(text)).toBe(text.data.textFormat);
  });
});

describe('getTextLabelRuntime', () => {
  it('returns the runtime for a TextLabel', () => {
    const text = createTextLabel();
    const runtime = getTextLabelRuntime(text);
    expect(runtime).not.toBeNull();
  });
});

describe('getTextLabelString', () => {
  it('returns the text field', () => {
    const text = createTextLabel({ data: { text: 'hello' } });
    expect(getTextLabelString(text)).toBe('hello');
  });
});

describe('invalidateTextLabel', () => {
  it('under autoSize none, bumps content only, without touching local bounds or the transform', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    const transform = getNodeLocalTransformRevision(text);
    invalidateTextLabel(text);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).toBe(bounds);
    expect(getNodeLocalTransformRevision(text)).toBe(transform);
  });

  it('also invalidates local bounds under autoSize, since the extent is measured from content', () => {
    const text = createTextLabel({ data: { autoSize: 'left' } });
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    const transform = getNodeLocalTransformRevision(text);
    invalidateTextLabel(text);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
    expect(getNodeLocalTransformRevision(text)).toBe(transform);
  });
});

describe('setTextLabelAutoSize', () => {
  it('sets autoSize, bumps content, and invalidates local bounds', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextLabelAutoSize(text, 'left');
    expect(text.data.autoSize).toBe('left');
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    setTextLabelAutoSize(text, 'none');
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextLabelFormat', () => {
  it('sets the format and bumps content without touching bounds', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    const format = { size: 24 };
    setTextLabelFormat(text, format);
    expect(text.data.textFormat).toBe(format);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).toBe(bounds);
  });
});

describe('setTextLabelHeight', () => {
  it('sets height, bumps content, and invalidates local bounds', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextLabelHeight(text, 250);
    expect(text.data.height).toBe(250);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    setTextLabelHeight(text, text.data.height);
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextLabelString', () => {
  it('sets text and bumps content without touching bounds under autoSize none', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextLabelString(text, 'hello');
    expect(text.data.text).toBe('hello');
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).toBe(bounds);
  });

  it('also invalidates bounds under autoSize (the box is measured from the text)', () => {
    const text = createTextLabel({ data: { autoSize: 'left' } });
    const bounds = getNodeLocalBoundsRevision(text);
    setTextLabelString(text, 'hello');
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createTextLabel({ data: { text: 'same' } });
    const content = getNodeLocalContentRevision(text);
    setTextLabelString(text, 'same');
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextLabelVerticalAlign', () => {
  it('defaults to top', () => {
    expect(createTextLabel().data.verticalAlign).toBe('top');
  });

  it('sets the value and bumps content without touching bounds', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextLabelVerticalAlign(text, 'middle');
    expect(text.data.verticalAlign).toBe('middle');
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createTextLabel({ data: { verticalAlign: 'bottom' } });
    const content = getNodeLocalContentRevision(text);
    setTextLabelVerticalAlign(text, 'bottom');
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextLabelWidth', () => {
  it('sets width, bumps content, and invalidates local bounds', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextLabelWidth(text, 300);
    expect(text.data.width).toBe(300);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createTextLabel();
    const content = getNodeLocalContentRevision(text);
    setTextLabelWidth(text, text.data.width);
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});
