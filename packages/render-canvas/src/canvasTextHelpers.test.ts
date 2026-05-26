import { colorToHex, formatToCanvasFont } from './canvasTextHelpers';

describe('colorToHex', () => {
  it('converts an RGB number to a CSS hex string', () => {
    expect(colorToHex(0xff0000)).toBe('#ff0000');
    expect(colorToHex(0x00ff00)).toBe('#00ff00');
    expect(colorToHex(0x0000ff)).toBe('#0000ff');
  });

  it('pads short values with leading zeros', () => {
    expect(colorToHex(0x000001)).toBe('#000001');
  });

  it('masks out any alpha component', () => {
    expect(colorToHex(0xff112233)).toBe('#112233');
  });
});

describe('formatToCanvasFont', () => {
  it('returns a CSS font string from format properties', () => {
    const font = formatToCanvasFont({ size: 16, font: 'Arial', bold: false, italic: false });
    expect(font).toBe('normal normal 16px Arial');
  });

  it('includes bold and italic when set', () => {
    const font = formatToCanvasFont({ size: 12, font: 'sans-serif', bold: true, italic: true });
    expect(font).toBe('italic bold 12px sans-serif');
  });

  it('uses defaults when size and font are omitted', () => {
    const font = formatToCanvasFont({});
    expect(font).toContain('12px');
    expect(font).toContain('serif');
  });
});
