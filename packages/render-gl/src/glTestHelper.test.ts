import { makeGL } from './glTestHelper';

describe('makeGL', () => {
  it('keeps draw validation outside a test-installed mock implementation', () => {
    const gl = makeGL();
    const draw = vi.fn();
    (gl.drawElements as ReturnType<typeof vi.fn>).mockImplementation(draw);

    gl.drawElements(gl.TRIANGLES, 1, gl.UNSIGNED_SHORT, 1);

    expect(draw).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.INVALID_OPERATION);

    gl.drawElements(gl.TRIANGLES, 1, gl.UNSIGNED_SHORT, 0);
    expect(draw).toHaveBeenCalledOnce();
  });

  it('sets and consumes the first GL draw error without throwing', () => {
    const gl = makeGL();

    expect(() => gl.drawElements(gl.TRIANGLES, -1, gl.UNSIGNED_SHORT, 0)).not.toThrow();
    gl.drawElements(0xffff, 1, gl.UNSIGNED_SHORT, 0);

    expect(gl.drawElements).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.INVALID_VALUE);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('reports a type-misaligned index offset as INVALID_OPERATION', () => {
    const gl = makeGL();

    gl.drawElements(gl.TRIANGLES, 1, gl.UNSIGNED_SHORT, 1);

    expect(gl.getError()).toBe(gl.INVALID_OPERATION);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('validates non-indexed and instanced draw entry points', () => {
    const gl = makeGL();

    gl.drawArrays(0xffff, 0, 1);
    expect(gl.getError()).toBe(gl.INVALID_ENUM);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 1, -1);
    expect(gl.getError()).toBe(gl.INVALID_VALUE);

    gl.drawElementsInstanced(gl.TRIANGLES, 1, gl.FLOAT, 0, 1);
    expect(gl.getError()).toBe(gl.INVALID_ENUM);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
