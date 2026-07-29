import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';

import { popGlClipRectangle, pushGlClipRectangle } from './glClipRectangle';
import { createGlState } from './glTestHelper';

describe('popGlClipRectangle', () => {
  it('restores the previous scissor rectangle', () => {
    const { state, gl } = createGlState();
    pushGlClipRectangle(state, createRectangle(0, 0, 100, 50), createMatrix());
    pushGlClipRectangle(state, createRectangle(10, 10, 10, 10), createMatrix());

    popGlClipRectangle(state);

    expect(gl.scissor).toHaveBeenLastCalledWith(0, 50, 100, 50);
  });

  it('disables scissor testing when the stack becomes empty', () => {
    const { state, gl } = createGlState();
    pushGlClipRectangle(state, createRectangle(0, 0, 100, 50), createMatrix());

    popGlClipRectangle(state);

    expect(gl.disable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(getGlRenderStateRuntime(state).currentScissorRect).toBeNull();
  });
});

describe('pushGlClipRectangle', () => {
  it('enables scissor testing with a transformed rectangle', () => {
    const { state, gl } = createGlState();

    pushGlClipRectangle(state, createRectangle(10, 20, 30, 40), createMatrix(1, 0, 0, 1, 5, 6));

    expect(gl.enable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(gl.scissor).toHaveBeenLastCalledWith(15, 34, 30, 40);
  });

  it('intersects nested scissor rectangles', () => {
    const { state, gl } = createGlState();

    pushGlClipRectangle(state, createRectangle(0, 0, 100, 100), createMatrix());
    pushGlClipRectangle(state, createRectangle(50, 25, 100, 50), createMatrix());

    expect(gl.scissor).toHaveBeenLastCalledWith(50, 25, 50, 50);
  });

  it('offsets a local clip into the active partial-target viewport', () => {
    const { state, gl } = createGlState();
    getGlRenderStateRuntime(state).renderTargetViewport = { height: 100, width: 100, x: 200, y: 50 };

    pushGlClipRectangle(state, createRectangle(10, 20, 30, 40), createMatrix());

    expect(gl.scissor).toHaveBeenLastCalledWith(210, 90, 30, 40);
  });
});
