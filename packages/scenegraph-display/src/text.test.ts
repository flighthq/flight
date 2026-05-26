import type { PartialNode, Text } from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import { createText, createTextData, createTextRuntime, getTextRuntime } from './text';

describe('createText', () => {
  let text: Text;

  beforeEach(() => {
    text = createText();
  });

  it('initializes default values', () => {
    expect(text.data.text).toBe('');
    expect(text.data.autoSize).toBe('none');
    expect(text.data.textFormat).not.toBeNull();
    expect(text.kind).toStrictEqual(TextKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<Text> = {
      data: {
        autoSize: 'left',
        text: 'foo',
      },
    };
    const obj = createText(base);
    expect(obj.data.autoSize).toStrictEqual(base.data!.autoSize);
    expect(obj.data.text).toStrictEqual(base.data!.text);
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
    expect(data.text).toBe('');
    expect(data.textFormat).not.toBeNull();
  });

  it('allows pre-defined values', () => {
    const data = createTextData({ autoSize: 'left', text: 'hello' });
    expect(data.autoSize).toBe('left');
    expect(data.text).toBe('hello');
  });
});

describe('createTextRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createTextRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getTextRuntime', () => {
  it('returns the runtime for a Text', () => {
    const text = createText();
    const runtime = getTextRuntime(text);
    expect(runtime).not.toBeNull();
  });
});
