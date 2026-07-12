import type { RichTextContent, TextFormat } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { registerMarkupNamedColors } from './markupNamedColors';
import { createMarkupTagRegistry, registerStandardMarkupTags } from './markupTagRegistry';
import { parseTextMarkup } from './textMarkup';

function formatAt(content: RichTextContent, index: number): TextFormat {
  for (const range of content.formatRanges) {
    if (index >= range.start && index < range.end) return range.format;
  }
  return {};
}

describe('registerMarkupNamedColors', () => {
  it('resolves CSS named font colors after being registered', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupNamedColors(registry);
    expect(formatAt(parseTextMarkup('<font color="red">x</font>', registry), 0).color).toBe(0xff0000);
    expect(formatAt(parseTextMarkup('<font color="RebeccaPurple">x</font>', registry), 0).color).toBe(0x663399);
    expect(formatAt(parseTextMarkup('<font color="cornflowerblue">x</font>', registry), 0).color).toBe(0x6495ed);
  });

  it('still resolves hex colors once named colors are registered', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupNamedColors(registry);
    expect(formatAt(parseTextMarkup('<font color="#f00">x</font>', registry), 0).color).toBe(0xff0000);
    expect(formatAt(parseTextMarkup('<font color="0x00ff00">x</font>', registry), 0).color).toBe(0x00ff00);
  });

  it('leaves an unknown color name unresolved rather than erroring', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupNamedColors(registry);
    expect(formatAt(parseTextMarkup('<font color="notacolor">x</font>', registry), 0).color).toBeUndefined();
  });

  it('augments the color seam in place without disturbing the standard font handler', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupNamedColors(registry);
    // size and face still parse through the same `<font>` handler.
    expect(formatAt(parseTextMarkup('<font color="red" size="24" face="Arial">x</font>', registry), 0)).toEqual({
      color: 0xff0000,
      font: 'Arial',
      size: 24,
    });
  });
});
