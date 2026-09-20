import { defaultGlShapeRenderer, registerGlShapeRasterizer } from './contract';

describe('defaultGlShapeRenderer', () => {
  it('is a Scene2DRenderer with a submit function', () => {
    expect(typeof defaultGlShapeRenderer.submit).toBe('function');
  });
});

describe('registerGlShapeRasterizer', () => {
  it('is exported as a function', () => {
    expect(typeof registerGlShapeRasterizer).toBe('function');
  });
});
