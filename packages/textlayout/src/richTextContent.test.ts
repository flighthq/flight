import { EntityRuntimeKey } from '@flighthq/entity/contract';

import { createRichTextContent, initializeRichTextContent } from './richTextContent.ts';

describe('createRichTextContent', () => {
  it('creates empty text and ranges', () => {
    const content = createRichTextContent();
    expect(Object.hasOwn(content, EntityRuntimeKey)).toBe(true);
    expect(content.text).toBe('');
    expect(content.formatRanges).toEqual([]);
  });
});

describe('initializeRichTextContent', () => {
  it('resets both construction fields', () => {
    const content = createRichTextContent();
    content.text = 'stale';
    initializeRichTextContent(content);
    expect(content.text).toBe('');
    expect(content.formatRanges).toEqual([]);
  });
});
