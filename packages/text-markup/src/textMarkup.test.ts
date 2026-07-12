import type { RichTextContent, TextFormat } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMarkupTagRegistry, registerMarkupTag } from './markupTagRegistry';
import { formatTextMarkup, parseTextMarkup } from './textMarkup';

function formatAt(content: RichTextContent, index: number): TextFormat {
  for (const range of content.formatRanges) {
    if (index >= range.start && index < range.end) return range.format;
  }
  return {};
}

describe('formatTextMarkup', () => {
  it('returns an empty string for empty content', () => {
    expect(formatTextMarkup({ formatRanges: [], text: '' })).toBe('');
  });

  it('emits plain text with no ranges and no tags', () => {
    expect(formatTextMarkup({ formatRanges: [], text: 'hello' })).toBe('hello');
  });

  it('escapes text entities on the way out', () => {
    expect(formatTextMarkup({ formatRanges: [], text: 'a < b & c > d' })).toBe('a &lt; b &amp; c &gt; d');
  });

  it('emits style booleans as their tags', () => {
    const content: RichTextContent = {
      formatRanges: [{ end: 4, format: { bold: true, italic: true, strikethrough: true, underline: true }, start: 0 }],
      text: 'text',
    };
    expect(formatTextMarkup(content)).toBe('<b><i><u><s>text</s></u></i></b>');
  });

  it('emits font color as a #rrggbb attribute', () => {
    const content: RichTextContent = {
      formatRanges: [{ end: 3, format: { color: 0xff0000, font: 'Verdana', size: 18 }, start: 0 }],
      text: 'red',
    };
    expect(formatTextMarkup(content)).toBe('<font color="#ff0000" size="18" face="Verdana">red</font>');
  });

  it('emits anchors with href and target', () => {
    const content: RichTextContent = {
      formatRanges: [{ end: 4, format: { target: '_blank', url: 'https://a.test' }, start: 0 }],
      text: 'link',
    };
    expect(formatTextMarkup(content)).toBe('<a href="https://a.test" target="_blank">link</a>');
  });

  it('emits textformat block metrics', () => {
    const content: RichTextContent = {
      formatRanges: [{ end: 1, format: { blockIndent: 4, leading: 2, leftMargin: 10, tabStops: [10, 20] }, start: 0 }],
      text: 'x',
    };
    expect(formatTextMarkup(content)).toBe(
      '<textformat blockindent="4" leading="2" leftmargin="10" tabstops="10,20">x</textformat>',
    );
  });

  it('emits bullets with a list marker type', () => {
    const content: RichTextContent = {
      formatRanges: [{ end: 4, format: { bullet: true, listMarker: 'square' }, start: 0 }],
      text: 'item',
    };
    expect(formatTextMarkup(content)).toBe('<li type="square">item</li>');
  });
});

describe('parseTextMarkup', () => {
  it('returns empty content for an empty string', () => {
    const content = parseTextMarkup('');
    expect(content.text).toBe('');
    expect(content.formatRanges).toEqual([]);
  });

  it('keeps plain text with no ranges', () => {
    const content = parseTextMarkup('just text');
    expect(content.text).toBe('just text');
    expect(content.formatRanges).toEqual([]);
  });

  it('decodes named and numeric entities', () => {
    const content = parseTextMarkup('&amp;&lt;&gt;&quot;&apos;&#65;&#x42;');
    expect(content.text).toBe('&<>"\'AB');
  });

  it('leaves unknown named entities verbatim', () => {
    expect(parseTextMarkup('&unknown;').text).toBe('&unknown;');
  });

  it('maps b/i/u/s tags to style booleans', () => {
    expect(formatAt(parseTextMarkup('<b>x</b>'), 0)).toEqual({ bold: true });
    expect(formatAt(parseTextMarkup('<i>x</i>'), 0)).toEqual({ italic: true });
    expect(formatAt(parseTextMarkup('<u>x</u>'), 0)).toEqual({ underline: true });
    expect(formatAt(parseTextMarkup('<s>x</s>'), 0)).toEqual({ strikethrough: true });
  });

  it('maps the strong/em/strike aliases to the same booleans', () => {
    expect(formatAt(parseTextMarkup('<strong>x</strong>'), 0)).toEqual({ bold: true });
    expect(formatAt(parseTextMarkup('<em>x</em>'), 0)).toEqual({ italic: true });
    expect(formatAt(parseTextMarkup('<strike>x</strike>'), 0)).toEqual({ strikethrough: true });
  });

  it('parses a CSS named font color', () => {
    expect(formatAt(parseTextMarkup('<font color="red">x</font>'), 0).color).toBe(0xff0000);
    expect(formatAt(parseTextMarkup('<font color="cornflowerblue">x</font>'), 0).color).toBe(0x6495ed);
  });

  it('uses a passed registry instead of the standard dialect', () => {
    const registry = createMarkupTagRegistry();
    registerMarkupTag(registry, 'hot', () => ({ color: 0xff0000 }));
    const content = parseTextMarkup('<hot>x</hot><b>y</b>', registry);
    expect(content.text).toBe('xy');
    // `hot` is registered; `b` is not, so it keeps its text with no format.
    expect(formatAt(content, 0)).toEqual({ color: 0xff0000 });
    expect(formatAt(content, 1)).toEqual({});
  });

  it('parses font color (#rrggbb, #rgb, 0x), size, and face', () => {
    expect(formatAt(parseTextMarkup('<font color="#ff0000">x</font>'), 0).color).toBe(0xff0000);
    expect(formatAt(parseTextMarkup('<font color="#f00">x</font>'), 0).color).toBe(0xff0000);
    expect(formatAt(parseTextMarkup('<font color="0x00ff00">x</font>'), 0).color).toBe(0x00ff00);
    expect(formatAt(parseTextMarkup('<font size="24" face="Arial">x</font>'), 0)).toEqual({ font: 'Arial', size: 24 });
  });

  it('ignores an unparseable font color rather than throwing', () => {
    expect(formatAt(parseTextMarkup('<font color="notacolor">x</font>'), 0).color).toBeUndefined();
  });

  it('parses anchors into url and target', () => {
    const format = formatAt(parseTextMarkup('<a href="https://a.test" target="_blank">x</a>'), 0);
    expect(format).toEqual({ target: '_blank', url: 'https://a.test' });
  });

  it('parses p align into the align field', () => {
    expect(formatAt(parseTextMarkup('<p align="center">x</p>'), 0)).toEqual({ align: 'center' });
  });

  it('parses li into bullet and an optional list marker', () => {
    expect(formatAt(parseTextMarkup('<li>x</li>'), 0)).toEqual({ bullet: true });
    expect(formatAt(parseTextMarkup('<li type="square">x</li>'), 0)).toEqual({ bullet: true, listMarker: 'square' });
  });

  it('inserts an implicit break before a block tag but not at the start', () => {
    expect(parseTextMarkup('<p align="left">first</p>').text).toBe('first');
    const content = parseTextMarkup('<p align="left">a</p><p align="right">b</p>');
    expect(content.text).toBe('a\nb');
    expect(formatAt(content, 0)).toEqual({ align: 'left' });
    expect(formatAt(content, 2)).toEqual({ align: 'right' });
  });

  it('collapses the block break against an existing trailing newline', () => {
    const content = parseTextMarkup('a<br><li>b</li>');
    expect(content.text).toBe('a\nb');
  });

  it('parses textformat block metrics', () => {
    const format = formatAt(
      parseTextMarkup('<textformat leftmargin="10" blockindent="4" tabstops="10, 20">x</textformat>'),
      0,
    );
    expect(format).toEqual({ blockIndent: 4, leftMargin: 10, tabStops: [10, 20] });
  });

  it('turns br into a newline with no orphan format', () => {
    const content = parseTextMarkup('a<br>b');
    expect(content.text).toBe('a\nb');
    expect(content.formatRanges).toEqual([]);
  });

  it('keeps span text but applies no format', () => {
    const content = parseTextMarkup('<span class="fancy">kept</span>');
    expect(content.text).toBe('kept');
    expect(content.formatRanges).toEqual([]);
  });

  it('drops img tags entirely', () => {
    const content = parseTextMarkup('a<img src="x.png"/>b');
    expect(content.text).toBe('ab');
    expect(content.formatRanges).toEqual([]);
  });

  it('composes nested tags into a single range', () => {
    const content = parseTextMarkup('<font color="#0000ff"><b>x</b></font>');
    expect(formatAt(content, 0)).toEqual({ bold: true, color: 0x0000ff });
  });

  it('splits ranges at format boundaries', () => {
    const content = parseTextMarkup('<b>a<i>b</i></b>c');
    expect(content.text).toBe('abc');
    expect(formatAt(content, 0)).toEqual({ bold: true });
    expect(formatAt(content, 1)).toEqual({ bold: true, italic: true });
    expect(formatAt(content, 2)).toEqual({});
  });

  it('recovers from an unclosed tag by extending to the end', () => {
    const content = parseTextMarkup('<b>bold to end');
    expect(content.text).toBe('bold to end');
    expect(formatAt(content, 0)).toEqual({ bold: true });
    expect(formatAt(content, content.text.length - 1)).toEqual({ bold: true });
  });

  it('keeps the text of unknown tags', () => {
    const content = parseTextMarkup('<marquee>scroll</marquee>');
    expect(content.text).toBe('scroll');
    expect(content.formatRanges).toEqual([]);
  });

  it('treats a stray < with no > as literal text', () => {
    const content = parseTextMarkup('a < b');
    expect(content.text).toBe('a < b');
  });

  it('ignores an extra closing tag without throwing', () => {
    const content = parseTextMarkup('a</b>b');
    expect(content.text).toBe('ab');
    expect(content.formatRanges).toEqual([]);
  });
});

describe('textMarkupRoundTrip', () => {
  const cases: string[] = [
    'plain text',
    'a <b>bold</b> and <i>italic</i> mix',
    '<font color="#123456" size="20" face="Georgia">styled</font>',
    '<a href="https://a.test" target="_top">link</a>',
    '<p align="justify">para</p>',
    '<li type="disc">bullet</li>',
    '<textformat leftmargin="8" indent="2" leading="4" tabstops="10,20,30">metrics</textformat>',
    '<font color="#00ff00"><b><u>deep</u></b></font>',
    'entities &amp; &lt; &gt; escaped',
    'line one<br>line two',
    '<p align="left">one</p><p align="right">two</p>',
    'lead<li type="disc">item</li>',
  ];

  it('is a fixed point over parse, format, reparse', () => {
    for (const source of cases) {
      const once = parseTextMarkup(source);
      const twice = parseTextMarkup(formatTextMarkup(once));
      expect(twice.text).toBe(once.text);
      expect(twice.formatRanges).toEqual(once.formatRanges);
    }
  });
});
