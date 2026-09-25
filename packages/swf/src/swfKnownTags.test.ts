import { describe, expect, it } from 'vitest';

import { isKnownSwfTag } from './swfKnownTags.ts';
import { SWF_TAG_NAMES } from './swfTagVocabulary.ts';

describe('isKnownSwfTag', () => {
  it('matches the named vocabulary throughout the complete ten-bit tag-code range', () => {
    expect(SWF_TAG_NAMES.size).toBe(69);
    for (let code = 0; code < 1024; code++) {
      expect(isKnownSwfTag(code), `tag ${code}`).toBe(SWF_TAG_NAMES.has(code));
    }
    expect(isKnownSwfTag(-1)).toBe(false);
  });
});
