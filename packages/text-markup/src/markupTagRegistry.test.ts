import type { MarkupTagRegistry, RichTextContent, TextFormat } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMarkupTagRegistry, registerMarkupTag, registerStandardMarkupTags } from './markupTagRegistry';
import { parseTextMarkup } from './textMarkup';

function formatAt(content: RichTextContent, index: number): TextFormat {
  for (const range of content.formatRanges) {
    if (index >= range.start && index < range.end) return range.format;
  }
  return {};
}

describe('createMarkupTagRegistry', () => {
  it('returns an empty, independent registry', () => {
    const a = createMarkupTagRegistry();
    const b = createMarkupTagRegistry();
    expect(a.handlers.size).toBe(0);
    registerMarkupTag(a, 'b', () => ({ bold: true }));
    expect(a.handlers.size).toBe(1);
    expect(b.handlers.size).toBe(0);
  });

  it('supplies the dialect for parseTextMarkup — an empty registry keeps text but no format', () => {
    const registry = createMarkupTagRegistry();
    const content = parseTextMarkup('<b>plain</b>', registry);
    expect(content.text).toBe('plain');
    expect(content.formatRanges).toEqual([]);
  });
});

describe('registerMarkupTag', () => {
  it('registers a custom tag whose handler contributes format', () => {
    const registry = createMarkupTagRegistry();
    registerMarkupTag(registry, 'acme.hot', () => ({ color: 0xff0000 }));
    const content = parseTextMarkup('<acme.hot>x</acme.hot>', registry);
    expect(formatAt(content, 0)).toEqual({ color: 0xff0000 });
  });

  it('matches tag names case-insensitively', () => {
    const registry = createMarkupTagRegistry();
    registerMarkupTag(registry, 'Loud', () => ({ bold: true }));
    expect(formatAt(parseTextMarkup('<LOUD>x</LOUD>', registry), 0)).toEqual({ bold: true });
  });

  it('is last-write-wins so a later registration overrides an earlier one', () => {
    const registry = createMarkupTagRegistry();
    registerMarkupTag(registry, 'x', () => ({ bold: true }));
    registerMarkupTag(registry, 'x', () => ({ italic: true }));
    expect(formatAt(parseTextMarkup('<x>y</x>', registry), 0)).toEqual({ italic: true });
  });

  it('reads a handler-provided attribute map', () => {
    const registry = createMarkupTagRegistry();
    registerMarkupTag(registry, 'size', (attributes) => {
      const value = Number.parseFloat(attributes.value ?? '');
      return Number.isFinite(value) ? { size: value } : {};
    });
    expect(formatAt(parseTextMarkup('<size value="18">x</size>', registry), 0)).toEqual({ size: 18 });
  });
});

describe('registerStandardMarkupTags', () => {
  function standardRegistry(): MarkupTagRegistry {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    return registry;
  }

  it('registers the standard style, font, block, and break tags', () => {
    const registry = standardRegistry();
    for (const name of [
      'a',
      'b',
      'br',
      'em',
      'font',
      'i',
      'li',
      'p',
      's',
      'span',
      'strike',
      'strong',
      'textformat',
      'u',
    ]) {
      expect(registry.handlers.has(name)).toBe(true);
    }
  });

  it('maps the bold/italic/strike aliases to the same booleans', () => {
    const registry = standardRegistry();
    expect(formatAt(parseTextMarkup('<strong>x</strong>', registry), 0)).toEqual({ bold: true });
    expect(formatAt(parseTextMarkup('<em>x</em>', registry), 0)).toEqual({ italic: true });
    expect(formatAt(parseTextMarkup('<strike>x</strike>', registry), 0)).toEqual({ strikethrough: true });
    expect(formatAt(parseTextMarkup('<s>x</s>', registry), 0)).toEqual({ strikethrough: true });
  });

  it('parses a CSS named font color', () => {
    const registry = standardRegistry();
    expect(formatAt(parseTextMarkup('<font color="red">x</font>', registry), 0).color).toBe(0xff0000);
    expect(formatAt(parseTextMarkup('<font color="RebeccaPurple">x</font>', registry), 0).color).toBe(0x663399);
  });

  it('inserts an implicit collapsing break before a block tag', () => {
    const registry = standardRegistry();
    const content = parseTextMarkup('a<p align="center">b</p>', registry);
    expect(content.text).toBe('a\nb');
    expect(formatAt(content, 2)).toEqual({ align: 'center' });
  });
});
