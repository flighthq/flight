import { compileGlShader, createGlProgram, linkGlProgram } from './glProgram';
import { makeGL } from './glTestHelper';

describe('compileGlShader', () => {
  it('compiles a shader of the requested type and returns it', () => {
    const gl = makeGL();
    const shader = compileGlShader(gl, gl.VERTEX_SHADER, 'void main(){}');
    expect(shader).toBeDefined();
    expect(gl.createShader).toHaveBeenCalledWith(gl.VERTEX_SHADER);
    expect(gl.shaderSource).toHaveBeenCalledWith(shader, 'void main(){}');
    expect(gl.compileShader).toHaveBeenCalledWith(shader);
  });

  it('throws with the label and info log when compilation fails', () => {
    const gl = makeGL();
    (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    (gl.getShaderInfoLog as ReturnType<typeof vi.fn>).mockReturnValueOnce('bad source');
    expect(() => compileGlShader(gl, gl.FRAGMENT_SHADER, 'x', 'Widget')).toThrow(
      'Widget shader compile error: bad source',
    );
  });
});

describe('createGlProgram', () => {
  it('compiles both stages, links, deletes the shaders, and returns the program', () => {
    const gl = makeGL();
    const program = createGlProgram(gl, 'void main(){}', 'void main(){}');
    expect(program).toBeDefined();
    expect(gl.createShader).toHaveBeenCalledWith(gl.VERTEX_SHADER);
    expect(gl.createShader).toHaveBeenCalledWith(gl.FRAGMENT_SHADER);
    expect(gl.attachShader).toHaveBeenCalledTimes(2);
    expect(gl.linkProgram).toHaveBeenCalledWith(program);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
  });

  it('propagates a link failure as a labelled error', () => {
    const gl = makeGL();
    (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (gl.getProgramInfoLog as ReturnType<typeof vi.fn>).mockReturnValueOnce('link failed');
    expect(() => createGlProgram(gl, 'a', 'b', 'Widget')).toThrow('Widget program link error: link failed');
  });
});

describe('linkGlProgram', () => {
  it('links the program and does not throw on success', () => {
    const gl = makeGL();
    const program = gl.createProgram()!;
    expect(() => linkGlProgram(gl, program)).not.toThrow();
    expect(gl.linkProgram).toHaveBeenCalledWith(program);
  });

  it('throws with the label and info log when linking fails', () => {
    const gl = makeGL();
    const program = gl.createProgram()!;
    (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (gl.getProgramInfoLog as ReturnType<typeof vi.fn>).mockReturnValueOnce('no link');
    expect(() => linkGlProgram(gl, program, 'Widget')).toThrow('Widget program link error: no link');
  });
});
