import { compileDefaultProgram, createDefaultBitmapShader, setWebGLAttribs, setWebGLMatrixFromTransform, setWebGLMatrixFromValues } from './webglShader';
import { makeGL, makeShaderLoc } from './webglTestHelper';

describe('compileDefaultProgram', () => {
  it('returns shader locations with all required fields', () => {
    const gl = makeGL();
    const loc = compileDefaultProgram(gl);
    expect(loc.program).toBeDefined();
    expect(typeof loc.locPosition).toBe('number');
    expect(typeof loc.locTexCoord).toBe('number');
    expect(loc.locMatrix).toBeDefined();
    expect(loc.locAlpha).toBeDefined();
    expect(loc.locTexture).toBeDefined();
  });

  it('compiles both vertex and fragment shaders', () => {
    const gl = makeGL();
    compileDefaultProgram(gl);
    expect(gl.createShader).toHaveBeenCalledWith((gl as unknown as { VERTEX_SHADER: number }).VERTEX_SHADER);
    expect(gl.createShader).toHaveBeenCalledWith((gl as unknown as { FRAGMENT_SHADER: number }).FRAGMENT_SHADER);
  });

  it('deletes both shader objects after linking', () => {
    const gl = makeGL();
    compileDefaultProgram(gl);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('throws when vertex shader compilation fails', () => {
    const gl = makeGL();
    (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    expect(() => compileDefaultProgram(gl)).toThrow('Shader compile error');
  });

  it('throws when program linking fails', () => {
    const gl = makeGL();
    (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(() => compileDefaultProgram(gl)).toThrow('Program link error');
  });
});

describe('createDefaultBitmapShader', () => {
  it('returns a shader with the provided program', () => {
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const shader = createDefaultBitmapShader(loc, m);
    expect(shader.program).toBe(loc.program);
  });

  it('returns a shader with a bind method', () => {
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const shader = createDefaultBitmapShader(loc, m);
    expect(typeof shader.bind).toBe('function');
  });
});

describe('setWebGLAttribs', () => {
  it('enables the position vertex attrib array', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    setWebGLAttribs(gl, loc);
    expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(loc.locPosition);
  });

  it('enables the texCoord vertex attrib array', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    setWebGLAttribs(gl, loc);
    expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(loc.locTexCoord);
  });

  it('configures position attrib with stride 16 and offset 0', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    setWebGLAttribs(gl, loc);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(loc.locPosition, 2, (gl as unknown as { FLOAT: number }).FLOAT, false, 16, 0);
  });

  it('configures texCoord attrib with stride 16 and offset 8', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    setWebGLAttribs(gl, loc);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(loc.locTexCoord, 2, (gl as unknown as { FLOAT: number }).FLOAT, false, 16, 8);
  });
});

describe('setWebGLMatrixFromTransform', () => {
  it('computes matrix scaled by canvas dimensions for identity transform', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;

    setWebGLMatrixFromTransform(gl, loc, m, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, canvas);

    expect(m[0]).toBeCloseTo(0.01);  // a * 2/width
    expect(m[1]).toBeCloseTo(0);     // -b * 2/height
    expect(m[2]).toBe(0);
    expect(m[3]).toBeCloseTo(0);     // c * 2/width
    expect(m[4]).toBeCloseTo(-0.02); // -d * 2/height
    expect(m[5]).toBe(0);
    expect(m[6]).toBeCloseTo(-1);    // tx * 2/width - 1
    expect(m[7]).toBeCloseTo(1);     // -ty * 2/height + 1
    expect(m[8]).toBe(1);
  });

  it('bakes translation into m[6] and m[7]', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;

    setWebGLMatrixFromTransform(gl, loc, m, { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 }, canvas);

    expect(m[6]).toBeCloseTo(-0.9); // 10 * 2/200 - 1
    expect(m[7]).toBeCloseTo(0.6);  // -20 * 2/100 + 1
  });

  it('negates b and d components to flip y-axis for clip space', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    setWebGLMatrixFromTransform(gl, loc, m, { a: 0, b: 2, c: 3, d: 0, tx: 0, ty: 0 }, canvas);

    expect(m[1]).toBeCloseTo(-0.04); // -b * 2/100
    expect(m[3]).toBeCloseTo(0.06);  // c * 2/100
    expect(m[4]).toBeCloseTo(0);     // -d * 2/100
  });

  it('calls uniformMatrix3fv with the filled matrix', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    setWebGLMatrixFromTransform(gl, loc, m, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, canvas);

    expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(loc.locMatrix, false, m);
  });
});

describe('setWebGLMatrixFromValues', () => {
  it('produces the same result as setWebGLMatrixFromTransform for equivalent inputs', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    const m1 = new Float32Array(9);
    const m2 = new Float32Array(9);
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const t = { a: 2, b: 0.5, c: -0.5, d: 3, tx: 10, ty: 20 };

    setWebGLMatrixFromTransform(gl, loc, m1, t, canvas);
    setWebGLMatrixFromValues(gl, loc, m2, t.a, t.b, t.c, t.d, t.tx, t.ty, canvas);

    for (let i = 0; i < 9; i++) {
      expect(m2[i]).toBeCloseTo(m1[i]);
    }
  });

  it('calls uniformMatrix3fv with the filled matrix', () => {
    const gl = makeGL();
    const loc = makeShaderLoc();
    const m = new Float32Array(9);
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;

    setWebGLMatrixFromValues(gl, loc, m, 1, 0, 0, 1, 0, 0, canvas);

    expect(gl.uniformMatrix3fv).toHaveBeenCalledWith(loc.locMatrix, false, m);
  });
});
