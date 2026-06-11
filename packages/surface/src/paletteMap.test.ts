import { applySurfacePaletteMap } from './paletteMap';
import { createSurface } from './surface';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

function invertTable(): number[] {
  const table = new Array<number>(256);
  for (let i = 0; i < 256; i++) table[i] = 255 - i;
  return table;
}

describe('applySurfacePaletteMap', () => {
  it('remaps a channel through its lookup table', () => {
    const source = createSurface(1, 1, 0x10203040);
    const out = createSurface(1, 1);
    applySurfacePaletteMap(region(out), region(source), invertTable(), null, null, null);
    expect(out.data[0]).toBe(255 - 0x10);
    expect(out.data[1]).toBe(0x20);
    expect(out.data[2]).toBe(0x30);
    expect(out.data[3]).toBe(0x40);
  });

  it('null maps leave every channel unchanged', () => {
    const source = createSurface(1, 1, 0x11223344);
    const out = createSurface(1, 1);
    applySurfacePaletteMap(region(out), region(source), null, null, null, null);
    expect(out.data[0]).toBe(0x11);
    expect(out.data[3]).toBe(0x44);
  });

  it('is safe in place', () => {
    const img = createSurface(1, 1, 0x00ff00ff);
    applySurfacePaletteMap(region(img), region(img), invertTable(), invertTable(), invertTable(), null);
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(255);
    expect(img.data[3]).toBe(0xff);
  });

  it('maps only the given sub-region', () => {
    const source = createSurface(2, 1, 0x80808080);
    const out = createSurface(2, 1);
    applySurfacePaletteMap(region(out, 1, 0, 1, 1), region(source, 1, 0, 1, 1), invertTable(), null, null, null);
    expect(out.data[4]).toBe(255 - 0x80);
    expect(out.data[0]).toBe(0); // untouched left pixel
  });
});
