// Shared GL shader-compile/link primitives. Every GL program in the SDK is built through these so the
// COMPILE_STATUS / LINK_STATUS checks are applied uniformly. Those queries are not only error handling:
// they force a driver that defers compilation/linking (KHR_parallel_shader_compile) to finish before the
// program's first use — without them the first draw on a cold GPU runs a not-yet-linked program and
// renders nothing. They also turn a silent shader failure into a thrown error carrying the driver's info
// log; `label` prefixes that message so the failing program is identifiable.

export function compileGlShader(gl: WebGL2RenderingContext, type: number, source: string, label = 'GL'): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`${label} shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

// Compiles a vertex+fragment source pair into a linked, ready-to-use program. The shaders are deleted
// once linked — the program retains them — so the caller owns only the returned program.
export function createGlProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label = 'GL',
): WebGLProgram {
  const vertexShader = compileGlShader(gl, gl.VERTEX_SHADER, vertexSource, label);
  const fragmentShader = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource, label);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  linkGlProgram(gl, program, label);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

// Links an already-assembled program (shaders attached, any pre-link configuration such as
// transform-feedback varyings done) and throws if linking failed.
export function linkGlProgram(gl: WebGL2RenderingContext, program: WebGLProgram, label = 'GL'): void {
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`${label} program link error: ${gl.getProgramInfoLog(program)}`);
  }
}
