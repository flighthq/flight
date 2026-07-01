import { getGlRenderStateRuntime } from './glRenderState';
import { registerGlBitmapShader } from './glShaderRegistry';
import { createGlState, makeShaderLoc } from './glTestHelper';

describe('registerGlBitmapShader', () => {
  it('uses the provided shader as the state default shader', () => {
    const { state } = createGlState();
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
