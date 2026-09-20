import { defaultWgpuShapeRenderer, registerWgpuShapeRasterizer } from './contract';

describe('defaultWgpuShapeRenderer', () => {
  it('is a Scene2DRenderer with a submit function', () => {
    expect(typeof defaultWgpuShapeRenderer.submit).toBe('function');
  });
});

describe('registerWgpuShapeRasterizer', () => {
  it('is exported as a function', () => {
    expect(typeof registerWgpuShapeRasterizer).toBe('function');
  });
});
