import { describe, expect, it } from 'vitest';

import { drawSurface } from './draw';
import { createSurface } from './surface';

describe('drawSurface', () => {
  it('does not throw when drawing onto a canvas', () => {
    const src = createSurface(2, 2, 0xff112233);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => drawSurface(canvas, src, 0, 0)).not.toThrow();
  });

  it('does not throw when drawing at an offset', () => {
    const src = createSurface(2, 2, 0xff112233);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    expect(() => drawSurface(canvas, src, 2, 2)).not.toThrow();
  });
});
