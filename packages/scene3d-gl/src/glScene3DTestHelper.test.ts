import { makeFakeGl2 } from './glScene3DTestHelper';

describe('makeFakeGl2', () => {
  it('sets and consumes the first GL draw error without recording an invalid draw', () => {
    const gl = makeFakeGl2();

    expect(() => gl.drawElements(gl.TRIANGLES, -1, gl.UNSIGNED_SHORT, 0)).not.toThrow();
    gl.drawElements(0xffff, 1, gl.UNSIGNED_SHORT, 0);

    expect(gl.calls.some((call) => call.name === 'drawElements')).toBe(false);
    expect(gl.getError()).toBe(gl.INVALID_VALUE);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('reports a type-misaligned index offset as INVALID_OPERATION', () => {
    const gl = makeFakeGl2();

    gl.drawElements(gl.TRIANGLES, 1, gl.UNSIGNED_SHORT, 1);

    expect(gl.calls.some((call) => call.name === 'drawElements')).toBe(false);
    expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('validates non-indexed and instanced draw entry points', () => {
    const gl = makeFakeGl2();

    gl.drawArrays(0xffff, 0, 1);
    expect(gl.getError()).toBe(gl.INVALID_ENUM);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 1, -1);
    expect(gl.getError()).toBe(gl.INVALID_VALUE);

    gl.drawElementsInstanced(gl.TRIANGLES, 1, gl.FLOAT, 0, 1);
    expect(gl.getError()).toBe(gl.INVALID_ENUM);
    expect(gl.calls.some((call) => call.name.startsWith('draw'))).toBe(false);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
