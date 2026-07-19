import {
  clearCanvasTarget,
  compositeCanvasImage,
  compositeCanvasSourceMode,
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

describe('drawCanvasTintedAlphaMask', () => {
  it('is a function', () => {
    expect(typeof drawCanvasTintedAlphaMask).toBe('function');
  });
});
