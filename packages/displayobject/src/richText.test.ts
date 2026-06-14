import { getEntityRuntime } from '@flighthq/entity';
import { createRectangle } from '@flighthq/geometry';
import type { Node, RichText, RichTextRuntime } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import {
  clearRichTextFormatRanges,
  computeRichTextLocalBoundsRectangle,
  createRichText,
  createRichTextData,
  createRichTextRuntime,
  dispatchRichTextWheel,
  getRichTextRuntime,
  setRichTextFormatRange,
  setRichTextScrollH,
  setRichTextScrollV,
  setRichTextString,
} from './richText';

describe('clearRichTextFormatRanges', () => {
  it('removes serialized format ranges', () => {
    const richText = createRichText();
    setRichTextFormatRange(richText, { bold: true }, 0, 1);
    clearRichTextFormatRanges(richText);
    expect(richText.data.textFormatRanges).toEqual([]);
  });
});

describe('computeRichTextLocalBoundsRectangle', () => {
  it('sets out.width and out.height from data dimensions', () => {
    const richText = createRichText({ data: { width: 200, height: 150 } });
    const out = createRectangle();
    computeRichTextLocalBoundsRectangle(out, richText as unknown as Node);
    expect(out.width).toBe(200);
    expect(out.height).toBe(150);
  });
});

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
    expect(richText.data.styleSheet).toBeNull();
    expect(richText.data.textColor).toBe(0);
    expect(richText.data.textFormatRanges).toEqual([]);
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
        styleSheet: { p: { color: 0xff00ff } },
        textColor: 0xff,
        textFormatRanges: [{ start: 0, end: 2, format: { bold: true } }],
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
    expect(obj.data.textFormatRanges).toStrictEqual(base.data.textFormatRanges);
    expect(obj.data.textFormatRanges).not.toBe(base.data.textFormatRanges);
    expect(obj.data.wordWrap).toStrictEqual(base.data.wordWrap);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRichText(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createRichTextData', () => {
  it('returns default values', () => {
    const data = createRichTextData();
    expect(data.width).toBe(100);
    expect(data.height).toBe(100);
    expect(data.htmlText).toBe('');
    expect(data.multiline).toBe(true);
    expect(data.wordWrap).toBe(false);
  });

  it('allows pre-defined values', () => {
    const data = createRichTextData({ width: 300, height: 200, htmlText: '<b>hi</b>' });
    expect(data.width).toBe(300);
    expect(data.height).toBe(200);
    expect(data.htmlText).toBe('<b>hi</b>');
  });
});

describe('createRichTextRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createRichTextRuntime();
    expect(runtime).not.toBeNull();
  });

  it('starts without attached layout runtime state', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.textLayout).toBeNull();
  });

  it('starts without attached content runtime state', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.richTextContent).toBeNull();
  });

  it('uses computeRichTextLocalBoundsRectangle', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeRichTextLocalBoundsRectangle);
  });
});

describe('dispatchRichTextWheel', () => {
  it('advances scrollV by the given delta', () => {
    const richText = createRichText();
    expect(richText.data.scrollV).toBe(1);
    dispatchRichTextWheel(richText, 2);
    expect(richText.data.scrollV).toBe(3);
  });
});

describe('getRichTextRuntime', () => {
  it('returns the runtime for a RichText', () => {
    const richText = createRichText();
    const runtime = getRichTextRuntime(richText);
    expect(runtime).not.toBeNull();
  });
});

describe('setRichTextFormatRange', () => {
  it('adds a serialized format range', () => {
    const richText = createRichText({ data: { text: 'hello' } });
    setRichTextFormatRange(richText, { italic: true }, 1, 4);
    expect(richText.data.textFormatRanges).toEqual([{ start: 1, end: 4, format: { italic: true } }]);
  });
});

describe('setRichTextScrollH', () => {
  it('sets scrollH to the given value', () => {
    const richText = createRichText();
    setRichTextScrollH(richText, 10);
    expect(richText.data.scrollH).toBe(10);
  });

  it('clamps scrollH to 0 minimum', () => {
    const richText = createRichText();
    setRichTextScrollH(richText, -5);
    expect(richText.data.scrollH).toBe(0);
  });
});

describe('setRichTextScrollV', () => {
  it('sets scrollV to the given value', () => {
    const richText = createRichText();
    setRichTextScrollV(richText, 4);
    expect(richText.data.scrollV).toBe(4);
  });

  it('clamps scrollV to 1 minimum', () => {
    const richText = createRichText();
    setRichTextScrollV(richText, 0);
    expect(richText.data.scrollV).toBe(1);
  });
});

describe('setRichTextString', () => {
  it('sets the text', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    expect(richText.data.text).toBe('hello');
  });

  it('invalidates appearance', () => {
    const richText = createRichText();
    const runtime = getEntityRuntime(richText) as RichTextRuntime;
    const idBefore = runtime.appearanceID;
    setRichTextString(richText, 'hello');
    expect(runtime.appearanceID).not.toBe(idBefore);
  });
});
