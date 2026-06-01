import type { WebGLRenderStateInternal, WebGLShaderLocations } from './internal';

// makeGL returns a fresh isolated mock for unit tests that call GL functions
// directly (e.g. shader math tests) and need a clean call-count slate.
export function makeGL(): WebGL2RenderingContext {
  return {
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
    NEAREST: 9728,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    UNSIGNED_SHORT: 5123,
    FLOAT: 5126,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37397,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    TRIANGLES: 4,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    BLEND: 3042,
    DEPTH_TEST: 2929,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 771,
    COLOR_BUFFER_BIT: 16384,
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    pixelStorei: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),
    useProgram: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawElements: vi.fn(),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    deleteShader: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

export function makeShaderLoc(): WebGLShaderLocations {
  return {
    program: {} as WebGLProgram,
    locPosition: 0,
    locTexCoord: 1,
    locMatrix: {} as WebGLUniformLocation,
    locAlpha: {} as WebGLUniformLocation,
    locTexture: {} as WebGLUniformLocation,
  };
}

export function makeWebGLState(options?: { allowSmoothing?: boolean; backgroundColorRGBA?: number[] }): {
  state: WebGLRenderStateInternal;
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  shaderLoc: WebGLShaderLocations;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const gl = makeGL();
  const shaderLoc = makeShaderLoc();
  const state = {
    canvas,
    gl,
    allowSmoothing: options?.allowSmoothing ?? true,
    currentBlendMode: null,
    currentProgram: null,
    currentTexture: null,
    backgroundColorRGBA: options?.backgroundColorRGBA ?? [0, 0, 0, 0],
    backgroundColor: 0,
    textureCache: new WeakMap<CanvasImageSource, WebGLTexture>(),
    shaderLoc,
    defaultBitmapShader: { program: shaderLoc.program, bind: vi.fn() },
    quadVertexBuffer: {} as WebGLBuffer,
    quadIndexBuffer: {} as WebGLBuffer,
    quadVertexData: new Float32Array(16),
    matrixArray: new Float32Array(9),
  } as unknown as WebGLRenderStateInternal;
  return { state, gl, canvas, shaderLoc };
}
