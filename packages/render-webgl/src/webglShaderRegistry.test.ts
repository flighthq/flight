import { registerWebGLBitmapShader } from './webglShaderRegistry';
import { makeShaderLoc, makeWebGLState } from './webglTestHelper';

describe('registerWebGLBitmapShader', () => {
  it('uses the provided shader as the state default shader', () => {
    const { state } = makeWebGLState();
    const loc = makeShaderLoc();
    const shader = {
      bind: vi.fn(),
      locations: loc,
      program: loc.program,
    };

    registerWebGLBitmapShader(state, shader);

    expect(state.defaultBitmapShader).toBe(shader);
  });
});
