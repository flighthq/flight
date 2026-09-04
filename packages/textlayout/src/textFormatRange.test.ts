import { createTextFormatRange, initializeTextFormatRange } from './textFormatRange';

describe('createTextFormatRange', () => {
  it('creates a range with the given fields', () => {
    const fmt = { size: 16, bold: true };
    const range = createTextFormatRange(fmt, 0, 10);
    expect(range).toMatchObject({ end: 10, format: fmt, start: 0 });
  });
});
describe('initializeTextFormatRange', () => {
  it('is the construction initializer of createTextFormatRange', () => {
    expect(typeof initializeTextFormatRange).toBe('function');
  });
});
