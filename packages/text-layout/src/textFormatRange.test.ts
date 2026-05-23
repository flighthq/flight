import { describe, expect, it } from 'vitest';

import { createTextFormatRange } from './textFormatRange';

describe('createTextFormatRange', () => {
  it('creates a range with the given fields', () => {
    const fmt = { size: 16, bold: true };
    const range = createTextFormatRange(fmt, 0, 10);
    expect(range).toEqual({ format: fmt, start: 0, end: 10 });
  });
});
