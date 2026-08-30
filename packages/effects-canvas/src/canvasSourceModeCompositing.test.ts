import { createCanvasRenderTarget } from './canvasEffectTestSupport';
import {
  clearCanvasTarget,
  compositeCanvasImage,
  compositeCanvasSourceMode,
  drawCanvasInvertedTintedAlphaMask,
  drawCanvasTintedAlphaMask,
} from './canvasSourceModeCompositing';

describe('clearCanvasTarget', () => {
  it('is a function', () => {
    expect(typeof clearCanvasTarget).toBe('function');
  });
});

describe('compositeCanvasImage', () => {
  it('is a function', () => {
    expect(typeof compositeCanvasImage).toBe('function');
  });
});

describe('compositeCanvasSourceMode', () => {
  it('is a function', () => {
    expect(typeof compositeCanvasSourceMode).toBe('function');
  });
});

describe('drawCanvasInvertedTintedAlphaMask', () => {
  it('fills the whole target and then knocks the source out of it', () => {
    // The inversion IS the knockout: fill everywhere, then remove where the silhouette is. Doing it the
    // other way round (source-in against the source) produces the ordinary tinted mask, which is the
    // outer-effect primitive and would turn every inner effect into an outer one.
    const dest = createCanvasRenderTarget(4, 4);
    const source = createCanvasRenderTarget(4, 4);
    source.canvas.id = 'source';
    const log: string[] = [];
    vi.spyOn(dest.context, 'fillRect').mockImplementation((() => {
      log.push(`fill|${dest.context.globalCompositeOperation}`);
    }) as typeof dest.context.fillRect);
    vi.spyOn(dest.context, 'drawImage').mockImplementation(((_i: CanvasImageSource, dx?: number, dy?: number) => {
      log.push(`draw|${dest.context.globalCompositeOperation}|${dx ?? 0},${dy ?? 0}`);
    }) as typeof dest.context.drawImage);

    drawCanvasInvertedTintedAlphaMask(dest, source, 0x123456, 1, 1);

    expect(log).toEqual(['fill|source-over', 'draw|destination-out|0,0']);
    vi.restoreAllMocks();
  });

  it('shifts which side of the boundary the tint survives on when given an offset', () => {
    const dest = createCanvasRenderTarget(4, 4);
    const source = createCanvasRenderTarget(4, 4);
    let offset = '';
    vi.spyOn(dest.context, 'drawImage').mockImplementation(((_i: CanvasImageSource, dx?: number, dy?: number) => {
      offset = `${dx ?? 0},${dy ?? 0}`;
    }) as typeof dest.context.drawImage);

    drawCanvasInvertedTintedAlphaMask(dest, source, 0x123456, 1, 1, 3, -2);

    expect(offset).toBe('3,-2');
    vi.restoreAllMocks();
  });
});

describe('drawCanvasTintedAlphaMask', () => {
  it('is a function', () => {
    expect(typeof drawCanvasTintedAlphaMask).toBe('function');
  });
});
