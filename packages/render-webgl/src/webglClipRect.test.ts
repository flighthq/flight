import { createMatrix, createRectangle } from '@flighthq/geometry';

import { popWebGLClipRectangle, pushWebGLClipRectangle } from './webglClipRect';
import { makeWebGLState } from './webglTestHelper';

describe('popWebGLClipRectangle', () => {
  it('restores the previous scissor rectangle', () => {
    const { state, gl } = makeWebGLState();
    pushWebGLClipRectangle(state, createRectangle(0, 0, 100, 50), createMatrix());
    pushWebGLClipRectangle(state, createRectangle(10, 10, 10, 10), createMatrix());

    popWebGLClipRectangle(state);

    expect(gl.scissor).toHaveBeenLastCalledWith(0, 50, 100, 50);
  });

  it('disables scissor testing when the stack becomes empty', () => {
    const { state, gl } = makeWebGLState();
    pushWebGLClipRectangle(state, createRectangle(0, 0, 100, 50), createMatrix());

    popWebGLClipRectangle(state);

    expect(gl.disable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(state.currentScissorRect).toBeNull();
  });
});

describe('pushWebGLClipRectangle', () => {
  it('enables scissor testing with a transformed rectangle', () => {
    const { state, gl } = makeWebGLState();

    pushWebGLClipRectangle(state, createRectangle(10, 20, 30, 40), createMatrix(1, 0, 0, 1, 5, 6));

    expect(gl.enable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(gl.scissor).toHaveBeenLastCalledWith(15, 34, 30, 40);
  });

  it('intersects nested scissor rectangles', () => {
    const { state, gl } = makeWebGLState();

    pushWebGLClipRectangle(state, createRectangle(0, 0, 100, 100), createMatrix());
    pushWebGLClipRectangle(state, createRectangle(50, 25, 100, 50), createMatrix());

    expect(gl.scissor).toHaveBeenLastCalledWith(50, 25, 50, 50);
  });
});
