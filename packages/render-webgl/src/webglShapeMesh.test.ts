import type { RenderProxy2D } from '@flighthq/types';

import { getWebGLRenderStateRuntime } from './webglRenderState';
import { drawWebGLShapeMeshes } from './webglShapeMesh';
import { makeWebGLState } from './webglTestHelper';

function makeProxy(): RenderProxy2D {
  return {
    alpha: 1,
    blendMode: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

const TRIANGLE = {
  vertices: new Float32Array([0, 0, 10, 0, 0, 10]),
  indices: new Uint16Array([0, 1, 2]),
  color: 0xff8040,
  alpha: 1,
};

describe('drawWebGLShapeMeshes', () => {
  it('binds the mesh program and draws each mesh', () => {
    const { state, gl } = makeWebGLState();

    drawWebGLShapeMeshes(state, makeProxy(), [TRIANGLE]);

    expect(gl.useProgram).toHaveBeenCalled();
    expect(gl.drawElements).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0);
  });

  it('records the mesh program as currentProgram so content draws re-bind', () => {
    const { state } = makeWebGLState();
    expect(getWebGLRenderStateRuntime(state).currentProgram).toBeNull();

    drawWebGLShapeMeshes(state, makeProxy(), [TRIANGLE]);

    expect(getWebGLRenderStateRuntime(state).currentProgram).not.toBeNull();
  });

  it('uploads premultiplied color (color * alpha) for the standard blend', () => {
    const { state, gl } = makeWebGLState();

    drawWebGLShapeMeshes(state, makeProxy(), [{ ...TRIANGLE, color: 0xffffff, alpha: 0.5 }]);

    expect(gl.uniform4f).toHaveBeenCalledWith(expect.anything(), 0.5, 0.5, 0.5, 0.5);
  });

  it('skips fully transparent meshes', () => {
    const { state, gl } = makeWebGLState();

    drawWebGLShapeMeshes(state, makeProxy(), [{ ...TRIANGLE, alpha: 0 }]);

    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty mesh list', () => {
    const { state, gl } = makeWebGLState();

    drawWebGLShapeMeshes(state, makeProxy(), []);

    expect(gl.useProgram).not.toHaveBeenCalled();
  });
});
