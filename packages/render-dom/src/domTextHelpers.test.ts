import { colorToCSS, formatToFont, htmlEscape } from './domTextHelpers';

describe('colorToCSS', () => {
  it('converts an RGB number to a CSS hex string', () => {
    expect(colorToCSS(0xff0000)).toBe('#ff0000');
    expect(colorToCSS(0x00ff00)).toBe('#00ff00');
    expect(colorToCSS(0x0000ff)).toBe('#0000ff');
  });

  it('pads short values with leading zeros', () => {
    expect(colorToCSS(0x000001)).toBe('#000001');
  });

  it('masks out any upper bits beyond RGB', () => {
    expect(colorToCSS(0xff112233)).toBe('#112233');
  });
});

describe('formatToFont', () => {
  it('returns a CSS font string from format properties', () => {
    const font = formatToFont({ size: 16, font: 'Arial', bold: false, italic: false });
    expect(font).toBe('normal normal 16px Arial');
  });

  it('includes bold and italic when set', () => {
    const font = formatToFont({ size: 12, font: 'sans-serif', bold: true, italic: true });
    expect(font).toBe('italic bold 12px sans-serif');
  });

  it('uses defaults when size and font are omitted', () => {
    const font = formatToFont({});
    expect(font).toContain('12px');
    expect(font).toContain('serif');
  });

  it('uses italic style when italic is true', () => {
    const font = formatToFont({ italic: true });
    expect(font).toMatch(/^italic /);
  });

  it('uses bold weight when bold is true', () => {
    const font = formatToFont({ bold: true });
    expect(font).toContain(' bold ');
  });
});

describe('htmlEscape', () => {
  it('escapes ampersands', () => {
    expect(htmlEscape('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than signs', () => {
    expect(htmlEscape('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than signs', () => {
    expect(htmlEscape('a>b')).toBe('a&gt;b');
  });

  it('escapes spaces to &nbsp;', () => {
    expect(htmlEscape('a b')).toBe('a&nbsp;b');
  });

  it('returns unchanged string when no special characters', () => {
    expect(htmlEscape('hello')).toBe('hello');
  });

  it('escapes multiple special characters in sequence', () => {
    expect(htmlEscape('<a & b>')).toBe('&lt;a&nbsp;&amp;&nbsp;b&gt;');
  });
});
