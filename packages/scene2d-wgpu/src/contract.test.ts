import { wgpuShapeRenderer, registerWgpuShapeRasterizer } from './contract';

describe('registerWgpuShapeRasterizer', () => {
  it('is exported as a function', () => {
    expect(typeof registerWgpuShapeRasterizer).toBe('function');
  });
});

describe('wgpuShapeRenderer', () => {
  it('is a Scene2DRenderer with a submit function', () => {
    expect(typeof wgpuShapeRenderer.submit).toBe('function');
  });
});
