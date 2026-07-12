import type { RichTextData, RichTextRuntime } from '@flighthq/types';

import {
  clearRichTextContent,
  computeRichTextContent,
  createRichTextContent,
  getRichTextContent,
} from './richTextContent';

function createData(data: Partial<RichTextData> = {}): RichTextData {
  return {
    autoSize: 'none',
    background: false,
    backgroundColor: 0xffffff,
    border: false,
    borderColor: 0,
    condenseWhite: false,
    defaultTextFormat: {},
    height: 100,
    htmlText: '',
    maxChars: -1,
    mouseWheelEnabled: true,
    multiline: true,
    scrollH: 0,
    scrollV: 1,
    selectable: true,
    styleSheet: null,
    text: '',
    textColor: 0,
    textFormat: {},
    textFormatRanges: [],
    verticalAlign: 'top',
    width: 100,
    wordWrap: false,
    ...data,
  };
}

function createRuntime(): RichTextRuntime {
  return { richTextContent: null, textLayout: null } as RichTextRuntime;
}

describe('clearRichTextContent', () => {
  it('clears the attached content', () => {
    const runtime = createRuntime();
    getRichTextContent(runtime);
    clearRichTextContent(runtime);
    expect(runtime.richTextContent).toBeNull();
  });
});

describe('computeRichTextContent', () => {
  it('uses plain text when htmlText is empty', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ text: 'hello', textColor: 0x336699 }));
    expect(content.text).toBe('hello');
    expect(content.formatRanges).toHaveLength(1);
    expect(content.formatRanges[0].format.color).toBe(0x336699);
  });

  it('prefers htmlText over text', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: '<b>rich</b>', text: 'plain' }));
    expect(content.text).toBe('rich');
    expect(content.formatRanges[0].format.bold).toBe(true);
  });

  it('decodes entities and br tags', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: 'A&amp;B<br>C' }));
    expect(content.text).toBe('A&B\nC');
  });

  it('applies inline font tags', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: '<font face="Arial" color="#ff00aa" size="18">Hi</font>' }));
    expect(content.formatRanges[0].format.font).toBe('Arial');
    expect(content.formatRanges[0].format.color).toBe(0xff00aa);
    expect(content.formatRanges[0].format.size).toBe(18);
  });

  it('applies nested text style tags', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: '<b>bold <i>both</i></b> normal' }));
    expect(content.text).toBe('bold both normal');
    expect(content.formatRanges[0].format.bold).toBe(true);
    expect(content.formatRanges[1].format.bold).toBe(true);
    expect(content.formatRanges[1].format.italic).toBe(true);
    expect(content.formatRanges[2].format.bold).toBeUndefined();
  });

  it('applies paragraph and textformat attributes', () => {
    const content = createRichTextContent();
    computeRichTextContent(
      content,
      createData({ htmlText: '<p align="center"><textformat leftmargin="4" leading="3">Hi</textformat></p>' }),
    );
    expect(content.text).toBe('Hi\n');
    expect(content.formatRanges[0].format.align).toBe('center');
    expect(content.formatRanges[0].format.leftMargin).toBe(4);
    expect(content.formatRanges[0].format.leading).toBe(3);
  });

  it('applies anchor link attributes', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: '<a href="https://example.com" target="_blank">Link</a>' }));
    expect(content.text).toBe('Link');
    expect(content.formatRanges[0].format.url).toBe('https://example.com');
    expect(content.formatRanges[0].format.target).toBe('_blank');
  });

  it('applies style sheet selectors and inline CSS', () => {
    const content = createRichTextContent();
    computeRichTextContent(
      content,
      createData({
        htmlText: '<p class="callout" style="font-weight:bold;text-decoration:underline">Styled</p>',
        styleSheet: {
          '.callout': { color: 0x445566, size: 20 },
          p: { align: 'right' },
        },
      }),
    );
    expect(content.formatRanges[0].format.align).toBe('right');
    expect(content.formatRanges[0].format.bold).toBe(true);
    expect(content.formatRanges[0].format.color).toBe(0x445566);
    expect(content.formatRanges[0].format.size).toBe(20);
    expect(content.formatRanges[0].format.underline).toBe(true);
  });

  it('condenses whitespace', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ condenseWhite: true, htmlText: '  A \n\t B  ' }));
    expect(content.text).toBe('A B ');
  });

  it('honors maxChars', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: '<b>Hello</b> world', maxChars: 7 }));
    expect(content.text).toBe('Hello w');
    expect(content.formatRanges[content.formatRanges.length - 1].end).toBe(7);
  });

  it('masks every character when a password character is supplied', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ htmlText: '<b>ignored</b>', text: 'secret' }), '*');
    expect(content.text).toBe('******');
    expect(content.formatRanges[0].format.bold).toBeUndefined();
  });

  it('falls back to the bullet mask when the password character is empty', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ text: 'ab' }), '');
    expect(content.text).toBe('••');
  });

  it('applies serialized text format ranges over plain text', () => {
    const content = createRichTextContent();
    computeRichTextContent(
      content,
      createData({
        text: 'hello',
        textFormatRanges: [{ start: 1, end: 4, format: { italic: true } }],
      }),
    );
    expect(content.formatRanges.map((range) => [range.start, range.end, range.format.italic])).toEqual([
      [0, 1, undefined],
      [1, 4, true],
      [4, 5, undefined],
    ]);
  });

  it('merges serialized text format ranges over htmlText', () => {
    const content = createRichTextContent();
    computeRichTextContent(
      content,
      createData({
        htmlText: '<b>hello</b>',
        textFormatRanges: [{ start: 1, end: 4, format: { color: 0xff0000 } }],
      }),
    );
    expect(content.formatRanges[1].format.bold).toBe(true);
    expect(content.formatRanges[1].format.color).toBe(0xff0000);
  });
});

describe('createRichTextContent', () => {
  it('creates empty text and ranges', () => {
    const content = createRichTextContent();
    expect(content.text).toBe('');
    expect(content.formatRanges).toEqual([]);
  });
});

describe('getRichTextContent', () => {
  it('attaches reusable content to runtime state', () => {
    const runtime = createRuntime();
    const content = getRichTextContent(runtime);
    expect(runtime.richTextContent).toBe(content);
    expect(getRichTextContent(runtime)).toBe(content);
  });
});
