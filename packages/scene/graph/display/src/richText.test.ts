import type { RichText } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import { createRichText } from './richText';

describe('createRichText', () => {
  let richText: RichText;

  beforeEach(() => {
    richText = createRichText();
  });

  it('initializes default values', () => {
    expect(richText.data.background).toBe(false);
    expect(richText.data.backgroundColor).toBe(0xffffff);
    expect(richText.data.border).toBe(false);
    expect(richText.data.borderColor).toBe(0);
    expect(richText.data.condenseWhite).toBe(false);
    expect(richText.data.defaultTextFormat).not.toBeNull();
    expect(richText.data.htmlText).toBe('');
    expect(richText.data.maxChars).toBe(-1);
    expect(richText.data.mouseWheelEnabled).toBe(true);
    expect(richText.data.multiline).toBe(true);
    expect(richText.data.scrollH).toBe(0);
    expect(richText.data.scrollV).toBe(1);
    expect(richText.data.selectable).toBe(true);
    expect(richText.data.styleSheet).toBe(undefined);
    expect(richText.data.textColor).toBe(0);
    expect(richText.data.wordWrap).toBe(false);
    expect(richText.kind).toStrictEqual(RichTextKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        background: true,
        backgroundColor: 0,
        border: true,
        borderColor: 0xff,
        condenseWhite: true,
        defaultTextFormat: {},
        htmlText: 'aslfkj',
        maxChars: 100,
        mouseWheelEnabled: false,
        multiline: false,
        selectable: false,
        styleSheet: undefined,
        textColor: 0xff,
        wordWrap: true,
      },
    };
    const obj = createRichText(base);
    expect(obj.data.background).toStrictEqual(base.data.background);
    expect(obj.data.backgroundColor).toStrictEqual(base.data.backgroundColor);
    expect(obj.data.border).toStrictEqual(base.data.border);
    expect(obj.data.borderColor).toStrictEqual(base.data.borderColor);
    expect(obj.data.condenseWhite).toStrictEqual(base.data.condenseWhite);
    expect(obj.data.defaultTextFormat).toStrictEqual(base.data.defaultTextFormat);
    expect(obj.data.htmlText).toStrictEqual(base.data.htmlText);
    expect(obj.data.maxChars).toStrictEqual(base.data.maxChars);
    expect(obj.data.mouseWheelEnabled).toStrictEqual(base.data.mouseWheelEnabled);
    expect(obj.data.multiline).toStrictEqual(base.data.multiline);
    expect(obj.data.selectable).toStrictEqual(base.data.selectable);
    expect(obj.data.styleSheet).toStrictEqual(base.data.styleSheet);
    expect(obj.data.textColor).toStrictEqual(base.data.textColor);
    expect(obj.data.wordWrap).toStrictEqual(base.data.wordWrap);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRichText(base);
    expect(obj).not.toStrictEqual(base);
  });
});
