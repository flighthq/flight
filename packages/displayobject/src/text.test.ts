import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRevision, getNodeLocalContentRevision } from '@flighthq/node';
import type { Node, PartialNode, Text } from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import {
  computeTextLocalBoundsRectangle,
  createText,
  createTextData,
  createTextRuntime,
  getTextRuntime,
  setTextAutoSize,
  setTextFormat,
  setTextHeight,
  setTextString,
  setTextWidth,
} from './text';

describe('computeTextLocalBoundsRectangle', () => {
  it('sets out dimensions from data width and height', () => {
    const text = createText({ data: { width: 200, height: 50 } });
    const out = createRectangle();
    computeTextLocalBoundsRectangle(out, text as unknown as Node);
    expect(out.width).toBe(200);
    expect(out.height).toBe(50);
  });
});

describe('createText', () => {
  let text: Text;

  beforeEach(() => {
    text = createText();
  });

  it('initializes default values', () => {
    expect(text.data.text).toBe('');
    expect(text.data.autoSize).toBe('none');
    expect(text.data.width).toBe(100);
    expect(text.data.height).toBe(100);
    expect(text.data.textFormat).not.toBeNull();
    expect(text.kind).toStrictEqual(TextKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<Text> = {
      data: {
        autoSize: 'left',
        text: 'foo',
        width: 300,
        height: 40,
      },
    };
    const obj = createText(base);
    expect(obj.data.autoSize).toStrictEqual(base.data!.autoSize);
    expect(obj.data.text).toStrictEqual(base.data!.text);
    expect(obj.data.width).toBe(300);
    expect(obj.data.height).toBe(40);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createText(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createTextData', () => {
  it('returns default values', () => {
    const data = createTextData();
    expect(data.autoSize).toBe('none');
    expect(data.height).toBe(100);
    expect(data.text).toBe('');
    expect(data.textFormat).not.toBeNull();
    expect(data.width).toBe(100);
  });

  it('allows pre-defined values', () => {
    const data = createTextData({ autoSize: 'left', text: 'hello', width: 250, height: 30 });
    expect(data.autoSize).toBe('left');
    expect(data.text).toBe('hello');
    expect(data.width).toBe(250);
    expect(data.height).toBe(30);
  });
});

describe('createTextRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createTextRuntime();
    expect(runtime).not.toBeNull();
  });

  it('starts without attached layout runtime state', () => {
    const runtime = createTextRuntime();
    expect(runtime.textLayout).toBeNull();
  });

  it('uses computeTextLocalBoundsRectangle', () => {
    const runtime = createTextRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeTextLocalBoundsRectangle);
  });
});

describe('getTextRuntime', () => {
  it('returns the runtime for a Text', () => {
    const text = createText();
    const runtime = getTextRuntime(text);
    expect(runtime).not.toBeNull();
  });
});

describe('setTextAutoSize', () => {
  it('sets autoSize, bumps content, and invalidates local bounds', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextAutoSize(text, 'left');
    expect(text.data.autoSize).toBe('left');
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    setTextAutoSize(text, 'none');
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextFormat', () => {
  it('sets the format and bumps content without touching bounds', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    const format = { size: 24 };
    setTextFormat(text, format);
    expect(text.data.textFormat).toBe(format);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).toBe(bounds);
  });
});

describe('setTextHeight', () => {
  it('sets height, bumps content, and invalidates local bounds', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextHeight(text, 250);
    expect(text.data.height).toBe(250);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    setTextHeight(text, text.data.height);
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextString', () => {
  it('sets text and bumps content without touching bounds', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextString(text, 'hello');
    expect(text.data.text).toBe('hello');
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createText({ data: { text: 'same' } });
    const content = getNodeLocalContentRevision(text);
    setTextString(text, 'same');
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});

describe('setTextWidth', () => {
  it('sets width, bumps content, and invalidates local bounds', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    const bounds = getNodeLocalBoundsRevision(text);
    setTextWidth(text, 300);
    expect(text.data.width).toBe(300);
    expect(getNodeLocalContentRevision(text)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(text)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const text = createText();
    const content = getNodeLocalContentRevision(text);
    setTextWidth(text, text.data.width);
    expect(getNodeLocalContentRevision(text)).toBe(content);
  });
});
