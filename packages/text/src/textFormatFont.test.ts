import { computeTextFormatFontString } from './textFormatFont';

describe('computeTextFormatFontString', () => {
  it('returns a CSS font string from format properties', () => {
    const font = computeTextFormatFontString({ size: 16, font: 'Arial', bold: false, italic: false });
    expect(font).toBe('normal normal 16px Arial');
  });

  it('includes bold and italic when set', () => {
    const font = computeTextFormatFontString({ size: 12, font: 'sans-serif', bold: true, italic: true });
    expect(font).toBe('italic bold 12px sans-serif');
  });

  it('uses defaults when size and font are omitted', () => {
    const font = computeTextFormatFontString({});
    expect(font).toContain('12px');
    expect(font).toContain('serif');
  });

  it('uses italic style when italic is true', () => {
    const font = computeTextFormatFontString({ italic: true });
    expect(font).toMatch(/^italic /);
  });

  it('uses bold weight when bold is true', () => {
    const font = computeTextFormatFontString({ bold: true });
    expect(font).toContain(' bold ');
  });
});
