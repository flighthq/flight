import { setRenderStateBackgroundColor } from './renderColor';
import { createRenderState } from './renderState';

describe('setRenderStateBackgroundColor', () => {
  it('sets the background color on the render state', () => {
    const state = createRenderState();
    setRenderStateBackgroundColor(state, 0xff0000ff);
    expect(state.backgroundColor).toBe(0xff0000ff);
  });
});
