import { createSurface } from './surface';
import { drawSurface } from './surfaceDraw';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('drawSurface', () => {
  it('does not throw when drawing onto a canvas', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => drawSurface(canvas, region(src), 0, 0)).not.toThrow();
  });

  it('does not throw when drawing at an offset', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    expect(() => drawSurface(canvas, region(src), 2, 2)).not.toThrow();
  });

  it('is a no-op for a zero-dimension region', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => drawSurface(canvas, region(src, 0, 0, 0, 0), 0, 0)).not.toThrow();
  });
});
