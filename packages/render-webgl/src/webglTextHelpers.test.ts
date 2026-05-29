import { colorToHex, formatToCanvasFont } from './webglTextHelpers';

describe('colorToHex', () => {
  it('converts basic RGB colors to CSS hex strings', () => {
    expect(colorToHex(0xff0000)).toBe('#ff0000');
    expect(colorToHex(0x00ff00)).toBe('#00ff00');
    expect(colorToHex(0x0000ff)).toBe('#0000ff');
  });

  it('pads short values with leading zeros', () => {
    expect(colorToHex(0x000001)).toBe('#000001');
    expect(colorToHex(0)).toBe('#000000');
  });

  it('masks out any alpha component', () => {
    expect(colorToHex(0xff112233)).toBe('#112233');
    expect(colorToHex(0xaaff0000)).toBe('#ff0000');
  });
});

describe('formatToCanvasFont', () => {
  it('returns a CSS font string with all properties specified', () => {
    const font = formatToCanvasFont({ size: 16, font: 'Arial', bold: false, italic: false });
    expect(font).toBe('normal normal 16px Arial');
  });

  it('sets italic style when italic is true', () => {
    const font = formatToCanvasFont({ size: 12, font: 'serif', bold: false, italic: true });
    expect(font).toBe('italic normal 12px serif');
  });

  it('sets bold weight when bold is true', () => {
    const font = formatToCanvasFont({ size: 14, font: 'sans-serif', bold: true, italic: false });
    expect(font).toBe('normal bold 14px sans-serif');
  });

  it('sets both bold and italic when both are true', () => {
    const font = formatToCanvasFont({ size: 12, font: 'sans-serif', bold: true, italic: true });
    expect(font).toBe('italic bold 12px sans-serif');
  });

  it('defaults size to 12px when size is not provided', () => {
    const font = formatToCanvasFont({});
    expect(font).toContain('12px');
  });

  it('defaults font family to serif when font is not provided', () => {
    const font = formatToCanvasFont({});
    expect(font).toContain('serif');
  });
});
