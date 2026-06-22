import { getGlRenderStateRuntime } from './webglRenderState';
import { registerGlBitmapShader } from './webglShaderRegistry';
import { makeGlState, makeShaderLoc } from './webglTestHelper';

describe('registerGlBitmapShader', () => {
  it('uses the provided shader as the state default shader', () => {
    const { state } = makeGlState();
    const loc = makeShaderLoc();
    const shader = {
      bind: vi.fn(),
      locations: loc,
      program: loc.program,
    };

    registerGlBitmapShader(state, shader);

    expect(getGlRenderStateRuntime(state).defaultBitmapShader).toBe(shader);
  });
});
