import type { RichTextContent, TextFormat } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { registerMarkupClassStyles } from './markupClassStyles';
import { createMarkupTagRegistry, registerStandardMarkupTags } from './markupTagRegistry';
import { parseTextMarkup } from './textMarkup';

function formatAt(content: RichTextContent, index: number): TextFormat {
  for (const range of content.formatRanges) {
    if (index >= range.start && index < range.end) return range.format;
  }
  return {};
}

describe('registerMarkupClassStyles', () => {
  it('styles a span by its class after being registered', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupClassStyles(registry, { warn: { bold: true, color: 0xff0000 } });
    const content = parseTextMarkup('<span class="warn">x</span>', registry);
    expect(content.text).toBe('x');
    expect(formatAt(content, 0)).toEqual({ bold: true, color: 0xff0000 });
  });

  it('leaves a span inert when its class is not in the map', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupClassStyles(registry, { warn: { bold: true } });
    const content = parseTextMarkup('<span class="unknown">x</span>', registry);
    expect(content.text).toBe('x');
    expect(content.formatRanges).toEqual([]);
  });

  it('merges several space-separated classes left to right', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupClassStyles(registry, {
      big: { size: 24 },
      loud: { bold: true, color: 0x0000ff },
      quiet: { color: 0x333333 },
    });
    // `loud` then `quiet` both name color; the later `quiet` wins the shared field, `size` survives.
    expect(formatAt(parseTextMarkup('<span class="big loud quiet">x</span>', registry), 0)).toEqual({
      bold: true,
      color: 0x333333,
      size: 24,
    });
  });

  it('matches class names case-sensitively', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupClassStyles(registry, { Warn: { bold: true } });
    expect(formatAt(parseTextMarkup('<span class="warn">x</span>', registry), 0)).toEqual({});
    expect(formatAt(parseTextMarkup('<span class="Warn">x</span>', registry), 0)).toEqual({ bold: true });
  });

  it('is last-write-wins over a previously installed class resolver', () => {
    const registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    registerMarkupClassStyles(registry, { tag: { bold: true } });
    registerMarkupClassStyles(registry, { tag: { italic: true } });
    expect(formatAt(parseTextMarkup('<span class="tag">x</span>', registry), 0)).toEqual({ italic: true });
  });
});
