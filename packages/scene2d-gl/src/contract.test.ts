import { glShapeRenderer, registerGlShapeRasterizer } from './contract.ts';

describe('glShapeRenderer', () => {
  it('is a Scene2DRenderer with a submit function', () => {
    expect(typeof glShapeRenderer.submit).toBe('function');
  });
});

describe('registerGlShapeRasterizer', () => {
  it('is exported as a function', () => {
    expect(typeof registerGlShapeRasterizer).toBe('function');
  });
});
