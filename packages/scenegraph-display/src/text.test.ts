import { createRectangle } from '@flighthq/geometry';
import type { GraphNode, PartialNode, Text } from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import { computeTextLocalBoundsRectangle, createText, createTextData, createTextRuntime, getTextRuntime } from './text';

describe('computeTextLocalBoundsRectangle', () => {
  it('sets out dimensions from data width and height', () => {
    const text = createText({ data: { width: 200, height: 50 } });
    const out = createRectangle();
    computeTextLocalBoundsRectangle(out, text as unknown as GraphNode);
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
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeTextLocalBoundsRectangle);
  });
});

describe('getTextRuntime', () => {
  it('returns the runtime for a Text', () => {
    const text = createText();
    const runtime = getTextRuntime(text);
    expect(runtime).not.toBeNull();
  });
});
