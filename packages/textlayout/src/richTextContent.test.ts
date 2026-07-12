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
    maxChars: -1,
    mouseWheelEnabled: true,
    multiline: true,
    scrollH: 0,
    scrollV: 1,
    selectable: true,
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
  it('renders plain text under the base format', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ text: 'hello', textColor: 0x336699 }));
    expect(content.text).toBe('hello');
    expect(content.formatRanges).toHaveLength(1);
    expect(content.formatRanges[0].format.color).toBe(0x336699);
  });

  it('decodes entities in plain text', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ text: 'A&amp;B' }));
    expect(content.text).toBe('A&B');
  });

  it('condenses whitespace', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ condenseWhite: true, text: '  A \n\t B  ' }));
    expect(content.text).toBe('A B ');
  });

  it('honors maxChars', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ maxChars: 7, text: 'Hello world' }));
    expect(content.text).toBe('Hello w');
    expect(content.formatRanges[content.formatRanges.length - 1].end).toBe(7);
  });

  it('masks every character when a password character is supplied', () => {
    const content = createRichTextContent();
    computeRichTextContent(content, createData({ text: 'secret' }), '*');
    expect(content.text).toBe('******');
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

  it('merges serialized text format ranges over the base format', () => {
    const content = createRichTextContent();
    computeRichTextContent(
      content,
      createData({
        text: 'hello',
        textColor: 0x000000,
        textFormatRanges: [{ start: 1, end: 4, format: { color: 0xff0000 } }],
      }),
    );
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
