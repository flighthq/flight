import { allocateEntity, finishEntity } from '@flighthq/entity/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { registerGlBitmapShader } from './glShaderRegistry';
import { createGlState, makeShaderLoc } from './glTestHelper';

describe('registerGlBitmapShader', () => {
  it('uses the provided shader as the state default shader', () => {
    const { state } = createGlState();
    const loc = makeShaderLoc();
    const shader = (() => {
      const out = allocateEntity<any>();
      out.bind = vi.fn();
      out.locations = loc;
      out.program = loc.program;
      return finishEntity(out);
    })();

    registerGlBitmapShader(state, shader);

    expect(getGlRenderStateRuntime(state).defaultBitmapShader).toBe(shader);
  });
});
