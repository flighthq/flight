import { drawCanvasEffectPass, passthroughCanvasEffectPass } from './canvasEffectCompositing';

describe('drawCanvasEffectPass', () => {
  it('is a function', () => {
    expect(typeof drawCanvasEffectPass).toBe('function');
  });
});

describe('passthroughCanvasEffectPass', () => {
  it('is a function', () => {
    expect(typeof passthroughCanvasEffectPass).toBe('function');
  });
});
