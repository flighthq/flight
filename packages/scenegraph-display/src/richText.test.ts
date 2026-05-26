import type { GraphNode, RichText } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';
import { createRectangle } from '@flighthq/geometry';

import {
  computeRichTextLocalBoundsRect,
  createRichText,
  createRichTextData,
  createRichTextRuntime,
  getRichTextRuntime,
} from './richText';

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

describe('computeRichTextLocalBoundsRect', () => {
  it('sets out.width and out.height from data dimensions', () => {
    const richText = createRichText({ data: { width: 200, height: 150 } });
    const out = createRectangle();
    computeRichTextLocalBoundsRect(out, richText as unknown as GraphNode);
    expect(out.width).toBe(200);
    expect(out.height).toBe(150);
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

  it('uses computeRichTextLocalBoundsRect', () => {
    const runtime = createRichTextRuntime();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeRichTextLocalBoundsRect);
  });
});

describe('getRichTextRuntime', () => {
  it('returns the runtime for a RichText', () => {
    const richText = createRichText();
    const runtime = getRichTextRuntime(richText);
    expect(runtime).not.toBeNull();
  });
});
