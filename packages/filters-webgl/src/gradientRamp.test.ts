import { createWebGLGradientRampTexture } from './gradientRamp';
import { makeFilterState } from './testHelper';

describe('createWebGLGradientRampTexture', () => {
  it('returns a WebGLTexture without throwing', () => {
    const { gl } = makeFilterState();
    const texture = createWebGLGradientRampTexture(gl, [0xff0000, 0x0000ff], [1, 1], [0, 255]);
    expect(texture).toBeDefined();
  });

  it('handles an empty color list without throwing', () => {
    const { gl } = makeFilterState();
    const texture = createWebGLGradientRampTexture(gl, [], [], []);
    expect(texture).toBeDefined();
  });

  it('handles a single-stop gradient without throwing', () => {
    const { gl } = makeFilterState();
    const texture = createWebGLGradientRampTexture(gl, [0xffffff], [1], [128]);
    expect(texture).toBeDefined();
  });
});
