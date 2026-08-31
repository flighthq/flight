export {};

interface FakeGlErrorAuditState {
  takePendingAuditMessage(): string | null;
}

const GL_ERROR_AUDIT_REGISTER_KEY = '__flightRegisterFakeGlErrorAuditState';
const glErrorAuditStates = new Set<FakeGlErrorAuditState>();
(globalThis as Record<string, unknown>)[GL_ERROR_AUDIT_REGISTER_KEY] = (state: FakeGlErrorAuditState): void => {
  glErrorAuditStates.add(state);
};

afterEach(() => {
  const pending = Array.from(glErrorAuditStates, (state) => state.takePendingAuditMessage()).filter(
    (message): message is string => message !== null,
  );
  if (pending.length > 0) {
    throw new Error(
      `Fake WebGL context ended the test with ${pending.length} unretrieved GL error${pending.length === 1 ? '' : 's'}:\n${pending.join('\n')}`,
    );
  }
});

if (typeof window !== 'undefined' && 'document' in window) {
  // Vitest's jsdom global can pair Node's TextEncoder with jsdom's Uint8Array constructor. The
  // encoded bytes then fail the platform invariant `bytes instanceof Uint8Array` (and esbuild
  // correctly refuses to run). Keep the single shared jsdom fast path, but copy encoded bytes into
  // its realm when the constructors do not already agree.
  if (!(new TextEncoder().encode('') instanceof Uint8Array)) {
    const NativeTextEncoder = TextEncoder;
    globalThis.TextEncoder = class RealmTextEncoder extends NativeTextEncoder {
      override encode(input?: string): Uint8Array<ArrayBuffer> {
        return new Uint8Array(super.encode(input));
      }
    };
  }

  // jsdom / browser environment
  // @ts-expect-error: quiet warning about types
  await import('@testing-library/jest-dom');
  await import('vitest-webgl-canvas-mock');
  installCanvas2dPixelReadbackValidation();
  installCanvas2dRoundRectValidation();

  // jsdom has no webgl2 context, and vitest-webgl-canvas-mock only covers webgl /
  // experimental-webgl, so patch getContext('webgl2') to return a vi.fn()-stubbed mock.
  // This is a stopgap for a missing jsdom-webgl2 dependency, kept inline as visible setup
  // cruft (not a reusable module) so it is replaced wholesale — not generalized — once a
  // real dependency emerges. makeGl2Context is defined below.
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
    if (contextId === 'webgl2') return makeGl2Context();
    return (originalGetContext as (...a: unknown[]) => unknown).call(this, contextId, ...args);
  } as typeof HTMLCanvasElement.prototype.getContext;
} else {
  // node environment
}

// vitest-webgl-canvas-mock records getImageData calls but ignores all four rectangle arguments and
// returns the full canvas. Keep the dependency's intentionally non-rasterizing buffer while restoring
// the browser contract that protects every jsdom consumer from a wrong-sized readback.
function installCanvas2dPixelReadbackValidation(): void {
  CanvasRenderingContext2D.prototype.getImageData = function (
    this: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): ImageData {
    if (arguments.length < 4) {
      throw new TypeError(
        `Failed to execute 'getImageData' on 'CanvasRenderingContext2D': 4 arguments required, but only ${arguments.length} present.`,
      );
    }

    enforceCanvasImageDataLong(sx);
    enforceCanvasImageDataLong(sy);
    const width = enforceCanvasImageDataLong(sw);
    const height = enforceCanvasImageDataLong(sh);
    if (width === 0 || height === 0) {
      throw new DOMException(
        "Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The source width or height is 0.",
        'IndexSizeError',
      );
    }
    return new ImageData(Math.abs(width), Math.abs(height));
  } as typeof CanvasRenderingContext2D.prototype.getImageData;
}

function enforceCanvasImageDataLong(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError("Failed to execute 'getImageData' on 'CanvasRenderingContext2D': value is not finite.");
  }
  const integer = Math.trunc(numeric);
  if (integer < -0x80000000 || integer > 0x7fffffff) {
    throw new TypeError("Failed to execute 'getImageData' on 'CanvasRenderingContext2D': value is outside long range.");
  }
  return integer;
}

// The canvas mock predates roundRect, which led individual tests to install an unrestricted vi.fn.
// Supply only the platform validation current Flight calls rely on; pixel/path realization remains the
// dependency's concern, and the fake must not grow into a second Canvas implementation.
function installCanvas2dRoundRectValidation(): void {
  if (typeof CanvasRenderingContext2D.prototype.roundRect === 'function') return;
  CanvasRenderingContext2D.prototype.roundRect = function (
    _x: number,
    _y: number,
    _width: number,
    _height: number,
    radii: number | DOMPointInit | Iterable<number | DOMPointInit> = 0,
  ): void {
    if (arguments.length < 4) {
      throw new TypeError(
        `Failed to execute 'roundRect' on 'CanvasRenderingContext2D': 4 arguments required, but only ${arguments.length} present.`,
      );
    }
    const coordinates = Array.from(arguments).slice(0, 4).map(Number);
    if (coordinates.some((value) => !Number.isFinite(value))) return;

    const values = Array.isArray(radii) ? radii : [radii];
    if (values.length < 1 || values.length > 4) {
      throw new RangeError(
        "Failed to execute 'roundRect' on 'CanvasRenderingContext2D': radii must have 1 to 4 values.",
      );
    }
    for (const value of values) {
      const point = typeof value === 'object' && value !== null;
      const radiusX = Number(point ? (value.x ?? 0) : value);
      const radiusY = Number(point ? (value.y ?? 0) : value);
      if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY)) return;
      if (radiusX < 0 || radiusY < 0) {
        throw new RangeError("Failed to execute 'roundRect' on 'CanvasRenderingContext2D': radius cannot be negative.");
      }
    }
  } as typeof CanvasRenderingContext2D.prototype.roundRect;
}

const GL_CONSTANTS: Record<string, number> = {
  TEXTURE_2D: 0x0de1,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  CLAMP_TO_EDGE: 0x812f,
  REPEAT: 0x2901,
  MIRRORED_REPEAT: 0x8370,
  LINEAR: 0x2601,
  NEAREST: 0x2600,
  NEAREST_MIPMAP_NEAREST: 0x2700,
  LINEAR_MIPMAP_NEAREST: 0x2701,
  NEAREST_MIPMAP_LINEAR: 0x2702,
  LINEAR_MIPMAP_LINEAR: 0x2703,
  RGBA: 0x1908,
  SRGB8_ALPHA8: 0x8c43,
  UNSIGNED_BYTE: 0x1401,
  UNSIGNED_SHORT: 0x1403,
  FLOAT: 0x1406,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9157,
  ARRAY_BUFFER: 0x8892,
  ELEMENT_ARRAY_BUFFER: 0x8893,
  STATIC_DRAW: 0x88b4,
  DYNAMIC_DRAW: 0x88b8,
  TRIANGLES: 0x0004,
  POINTS: 0x0000,
  LINES: 0x0001,
  LINE_LOOP: 0x0002,
  LINE_STRIP: 0x0003,
  TRIANGLE_STRIP: 0x0005,
  TRIANGLE_FAN: 0x0006,
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  BLEND: 0x0be2,
  DEPTH_TEST: 0x0b71,
  DEPTH_WRITEMASK: 0x0b72,
  STENCIL_TEST: 0x0b90,
  COLOR_CLEAR_VALUE: 0x0c22,
  COLOR_WRITEMASK: 0x0c23,
  SCISSOR_BOX: 0x0c10,
  VIEWPORT: 0x0ba2,
  CULL_FACE: 0x0b44,
  SCISSOR_TEST: 0x0c11,
  ZERO: 0,
  ONE: 1,
  SRC_COLOR: 0x0300,
  ONE_MINUS_SRC_COLOR: 0x0301,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  DST_ALPHA: 0x0304,
  ONE_MINUS_DST_ALPHA: 0x0305,
  DST_COLOR: 0x0306,
  ONE_MINUS_DST_COLOR: 0x0307,
  FUNC_ADD: 0x8006,
  FUNC_SUBTRACT: 0x800a,
  FUNC_REVERSE_SUBTRACT: 0x800b,
  MIN: 0x8007,
  MAX: 0x8008,
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x0100,
  STENCIL_BUFFER_BIT: 0x0400,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  NO_ERROR: 0,
  INVALID_ENUM: 0x0500,
  INVALID_VALUE: 0x0501,
  INVALID_OPERATION: 0x0502,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER: 0x8d40,
  RENDERBUFFER: 0x8d41,
  DEPTH_COMPONENT16: 0x81a5,
  UNSIGNED_INT: 0x1405,
  UNSIGNED_INT_24_8: 0x84fa,
  DEPTH24_STENCIL8: 0x88f0,
  DEPTH_STENCIL: 0x84f9,
  DEPTH_STENCIL_ATTACHMENT: 0x821a,
  COLOR: 0x1800,
  RGBA8: 0x8058,
  RGB8: 0x8051,
  ALWAYS: 0x0207,
  EQUAL: 0x0202,
  KEEP: 0x1e00,
  REPLACE: 0x1e01,
};

const GL_METHODS = [
  'activeTexture',
  'attachShader',
  'bindAttribLocation',
  'bindBuffer',
  'bindFramebuffer',
  'bindRenderbuffer',
  'bindTexture',
  'bindVertexArray',
  'blendColor',
  'blendEquation',
  'blendEquationSeparate',
  'blendFunc',
  'blendFuncSeparate',
  'bufferData',
  'bufferSubData',
  'checkFramebufferStatus',
  'clear',
  'clearBufferfi',
  'clearBufferfv',
  'clearBufferiv',
  'clearBufferuiv',
  'clearColor',
  'clearDepth',
  'clearStencil',
  'colorMask',
  'compileShader',
  'compressedTexImage2D',
  'compressedTexSubImage2D',
  'copyTexImage2D',
  'copyTexSubImage2D',
  'createBuffer',
  'createFramebuffer',
  'createProgram',
  'createQuery',
  'createRenderbuffer',
  'createSampler',
  'createShader',
  'createTexture',
  'createTransformFeedback',
  'createVertexArray',
  'cullFace',
  'deleteBuffer',
  'deleteFramebuffer',
  'deleteProgram',
  'deleteQuery',
  'deleteRenderbuffer',
  'deleteSampler',
  'deleteShader',
  'deleteTexture',
  'deleteTransformFeedback',
  'deleteVertexArray',
  'depthFunc',
  'depthMask',
  'depthRange',
  'detachShader',
  'disable',
  'disableVertexAttribArray',
  'drawArrays',
  'drawArraysInstanced',
  'drawBuffers',
  'drawElements',
  'drawElementsInstanced',
  // Deliberately record-only: Flight has no production drawRangeElements call to validate today.
  'drawRangeElements',
  'enable',
  'enableVertexAttribArray',
  'finish',
  'flush',
  'framebufferRenderbuffer',
  'framebufferTexture2D',
  'frontFace',
  'generateMipmap',
  'getActiveAttrib',
  'getActiveUniform',
  'getActiveUniforms',
  'getActiveUniformBlockName',
  'getActiveUniformBlockParameter',
  'getAttachedShaders',
  'getAttribLocation',
  'getBufferParameter',
  'getError',
  'getExtension',
  'getFragDataLocation',
  'getFramebufferAttachmentParameter',
  'getIndexedParameter',
  'getInternalformatParameter',
  'getParameter',
  'getProgramInfoLog',
  'getProgramParameter',
  'getQuery',
  'getQueryParameter',
  'getRenderbufferParameter',
  'getShaderInfoLog',
  'getShaderParameter',
  'getShaderPrecisionFormat',
  'getShaderSource',
  'getSupportedExtensions',
  'getTexParameter',
  'getTransformFeedbackVarying',
  'getUniform',
  'getUniformBlockIndex',
  'getUniformIndices',
  'getUniformLocation',
  'getVertexAttrib',
  'getVertexAttribOffset',
  'hint',
  'invalidateFramebuffer',
  'invalidateSubFramebuffer',
  'isBuffer',
  'isContextLost',
  'isEnabled',
  'isFramebuffer',
  'isProgram',
  'isQuery',
  'isRenderbuffer',
  'isSampler',
  'isShader',
  'isTexture',
  'isTransformFeedback',
  'isVertexArray',
  'lineWidth',
  'linkProgram',
  'pixelStorei',
  'polygonOffset',
  'readBuffer',
  'readPixels',
  'renderbufferStorage',
  'renderbufferStorageMultisample',
  'sampleCoverage',
  'samplerParameterf',
  'samplerParameteri',
  'scissor',
  'shaderSource',
  'stencilFunc',
  'stencilFuncSeparate',
  'stencilMask',
  'stencilMaskSeparate',
  'stencilOp',
  'stencilOpSeparate',
  'texImage2D',
  'texImage3D',
  'texParameterf',
  'texParameteri',
  'texStorage2D',
  'texStorage3D',
  'texSubImage2D',
  'texSubImage3D',
  'transformFeedbackVaryings',
  'uniform1f',
  'uniform1fv',
  'uniform1i',
  'uniform1iv',
  'uniform1ui',
  'uniform1uiv',
  'uniform2f',
  'uniform2fv',
  'uniform2i',
  'uniform2iv',
  'uniform2ui',
  'uniform2uiv',
  'uniform3f',
  'uniform3fv',
  'uniform3i',
  'uniform3iv',
  'uniform3ui',
  'uniform3uiv',
  'uniform4f',
  'uniform4fv',
  'uniform4i',
  'uniform4iv',
  'uniform4ui',
  'uniform4uiv',
  'uniformBlockBinding',
  'uniformMatrix2fv',
  'uniformMatrix2x3fv',
  'uniformMatrix2x4fv',
  'uniformMatrix3fv',
  'uniformMatrix3x2fv',
  'uniformMatrix3x4fv',
  'uniformMatrix4fv',
  'uniformMatrix4x2fv',
  'uniformMatrix4x3fv',
  'useProgram',
  'validateProgram',
  'vertexAttrib1f',
  'vertexAttrib1fv',
  'vertexAttrib2f',
  'vertexAttrib2fv',
  'vertexAttrib3f',
  'vertexAttrib3fv',
  'vertexAttrib4f',
  'vertexAttrib4fv',
  'vertexAttribDivisor',
  'vertexAttribI4i',
  'vertexAttribI4iv',
  'vertexAttribI4ui',
  'vertexAttribI4uiv',
  'vertexAttribIPointer',
  'vertexAttribPointer',
  'viewport',
];

// Inlined jsdom WebGL2 mock (stopgap; see the setup block above). Creates a fresh
// WebGL2RenderingContext with vi.fn() stubs for all methods.
function makeGl2Context(): WebGL2RenderingContext {
  const ctx: Record<string, unknown> = { ...GL_CONSTANTS };
  for (const name of GL_METHODS) {
    ctx[name] = vi.fn();
  }
  (ctx.createBuffer as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createFramebuffer as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createProgram as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createQuery as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createRenderbuffer as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createSampler as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createShader as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createTexture as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createTransformFeedback as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.createVertexArray as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.checkFramebufferStatus as ReturnType<typeof vi.fn>).mockImplementation(() => GL_CONSTANTS.FRAMEBUFFER_COMPLETE);
  // The vector-valued queries return a fixed-length sequence from any real context, so callers index
  // them directly. Returning undefined here would make a faithful caller throw in tests only, which
  // pushes test-shaped defensiveness into production code.
  // Capability enables and the depth write mask are the one piece of GL state a pass can silently
  // inherit from whatever drew before it, so the fake tracks them rather than answering undefined.
  // Without this a test can only assert that enable/disable were CALLED, which cannot express "depth
  // was off at the moment of the draw" — the property that separates a pass owning its state from one
  // that happens to run after something else turned it off. Defaults match GL: caps start disabled,
  // DEPTH_WRITEMASK starts true.
  const enabledCapabilities = new Set<number>();
  let depthWriteMask = true;
  (ctx.enable as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabledCapabilities.add(cap));
  (ctx.disable as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabledCapabilities.delete(cap));
  (ctx.isEnabled as ReturnType<typeof vi.fn>).mockImplementation((cap: number) => enabledCapabilities.has(cap));
  (ctx.depthMask as ReturnType<typeof vi.fn>).mockImplementation((flag: boolean) => {
    depthWriteMask = flag;
  });
  (ctx.getParameter as ReturnType<typeof vi.fn>).mockImplementation((parameter: number) => {
    if (parameter === GL_CONSTANTS.VIEWPORT || parameter === GL_CONSTANTS.SCISSOR_BOX) {
      return new Int32Array([0, 0, 0, 0]);
    }
    if (parameter === GL_CONSTANTS.COLOR_CLEAR_VALUE) return new Float32Array([0, 0, 0, 0]);
    if (parameter === GL_CONSTANTS.COLOR_WRITEMASK) return [true, true, true, true];
    if (parameter === GL_CONSTANTS.DEPTH_WRITEMASK) return depthWriteMask;
    return undefined;
  });
  (ctx.getAttribLocation as ReturnType<typeof vi.fn>).mockImplementation(() => 0);
  const errorState = createFakeGlErrorState('shared WebGL2 fake');
  installFakeGlDrawValidation(ctx, errorState);
  (ctx.getError as ReturnType<typeof vi.fn>).mockImplementation(() => errorState.getError());
  (ctx.getProgramInfoLog as ReturnType<typeof vi.fn>).mockImplementation(() => '');
  (ctx.getProgramParameter as ReturnType<typeof vi.fn>).mockImplementation(() => true);
  (ctx.getShaderInfoLog as ReturnType<typeof vi.fn>).mockImplementation(() => '');
  (ctx.getShaderParameter as ReturnType<typeof vi.fn>).mockImplementation(() => true);
  (ctx.getUniformLocation as ReturnType<typeof vi.fn>).mockImplementation(() => ({}));
  (ctx.isContextLost as ReturnType<typeof vi.fn>).mockImplementation(() => false);
  return ctx as unknown as WebGL2RenderingContext;
}

function createFakeGlErrorState(label: string): {
  getError(): number;
  setError(code: number, call: string, args: readonly unknown[]): void;
  takePendingAuditMessage(): string | null;
} {
  let pendingError = GL_CONSTANTS.NO_ERROR;
  let pendingMessage: string | null = null;
  const state = {
    getError(): number {
      const result = pendingError;
      pendingError = GL_CONSTANTS.NO_ERROR;
      pendingMessage = null;
      return result;
    },
    setError(code: number, call: string, args: readonly unknown[]): void {
      if (pendingError !== GL_CONSTANTS.NO_ERROR) return;
      pendingError = code;
      pendingMessage = `${label}: ${glErrorName(code)} from ${call}(${args.join(', ')})`;
    },
    takePendingAuditMessage(): string | null {
      const result = pendingMessage;
      pendingError = GL_CONSTANTS.NO_ERROR;
      pendingMessage = null;
      return result;
    },
  };
  glErrorAuditStates.add(state);
  return state;
}

function glErrorName(error: number): string {
  if (error === GL_CONSTANTS.INVALID_ENUM) return 'INVALID_ENUM';
  if (error === GL_CONSTANTS.INVALID_VALUE) return 'INVALID_VALUE';
  return 'INVALID_OPERATION';
}

function installFakeGlDrawValidation(
  ctx: Record<string, unknown>,
  errorState: ReturnType<typeof createFakeGlErrorState>,
): void {
  ctx.drawArrays = makeValidatedFakeGlDrawMock(
    ctx.drawArrays as ReturnType<typeof vi.fn>,
    (mode: number, first: number, count: number) =>
      validateFakeGlDrawArrays(errorState, 'drawArrays', mode, first, count),
  );
  ctx.drawArraysInstanced = makeValidatedFakeGlDrawMock(
    ctx.drawArraysInstanced as ReturnType<typeof vi.fn>,
    (mode: number, first: number, count: number, instanceCount: number) =>
      validateFakeGlDrawArrays(errorState, 'drawArraysInstanced', mode, first, count, instanceCount),
  );
  ctx.drawElements = makeValidatedFakeGlDrawMock(
    ctx.drawElements as ReturnType<typeof vi.fn>,
    (mode: number, count: number, type: number, offset: number) =>
      validateFakeGlDrawElements(errorState, 'drawElements', mode, count, type, offset),
  );
  ctx.drawElementsInstanced = makeValidatedFakeGlDrawMock(
    ctx.drawElementsInstanced as ReturnType<typeof vi.fn>,
    (mode: number, count: number, type: number, offset: number, instanceCount: number) =>
      validateFakeGlDrawElements(errorState, 'drawElementsInstanced', mode, count, type, offset, instanceCount),
  );
}

function makeValidatedFakeGlDrawMock(
  mock: ReturnType<typeof vi.fn>,
  validate: (...args: never[]) => boolean,
): ReturnType<typeof vi.fn> {
  return new Proxy(mock, {
    apply(target, thisArg, args: never[]) {
      if (!validate(...args)) return undefined;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

function isFakeGlPrimitiveMode(mode: number): boolean {
  return (
    mode === GL_CONSTANTS.POINTS ||
    mode === GL_CONSTANTS.LINES ||
    mode === GL_CONSTANTS.LINE_LOOP ||
    mode === GL_CONSTANTS.LINE_STRIP ||
    mode === GL_CONSTANTS.TRIANGLES ||
    mode === GL_CONSTANTS.TRIANGLE_STRIP ||
    mode === GL_CONSTANTS.TRIANGLE_FAN
  );
}

function validateFakeGlDrawArrays(
  errorState: ReturnType<typeof createFakeGlErrorState>,
  call: string,
  mode: number,
  first: number,
  count: number,
  instanceCount?: number,
): boolean {
  const args = instanceCount === undefined ? [mode, first, count] : [mode, first, count, instanceCount];
  if (!isFakeGlPrimitiveMode(mode)) {
    errorState.setError(GL_CONSTANTS.INVALID_ENUM, call, args);
    return false;
  }
  if (first < 0 || count < 0 || (instanceCount !== undefined && instanceCount < 0)) {
    errorState.setError(GL_CONSTANTS.INVALID_VALUE, call, args);
    return false;
  }
  return true;
}

function validateFakeGlDrawElements(
  errorState: ReturnType<typeof createFakeGlErrorState>,
  call: string,
  mode: number,
  count: number,
  type: number,
  offset: number,
  instanceCount?: number,
): boolean {
  const args = instanceCount === undefined ? [mode, count, type, offset] : [mode, count, type, offset, instanceCount];
  if (!isFakeGlPrimitiveMode(mode)) {
    errorState.setError(GL_CONSTANTS.INVALID_ENUM, call, args);
    return false;
  }
  const typeSize =
    type === GL_CONSTANTS.UNSIGNED_BYTE
      ? 1
      : type === GL_CONSTANTS.UNSIGNED_SHORT
        ? 2
        : type === GL_CONSTANTS.UNSIGNED_INT
          ? 4
          : 0;
  if (typeSize === 0) {
    errorState.setError(GL_CONSTANTS.INVALID_ENUM, call, args);
    return false;
  }
  if (count < 0 || offset < 0 || (instanceCount !== undefined && instanceCount < 0)) {
    errorState.setError(GL_CONSTANTS.INVALID_VALUE, call, args);
    return false;
  }
  if (offset % typeSize !== 0) {
    errorState.setError(GL_CONSTANTS.INVALID_OPERATION, call, args);
    return false;
  }
  return true;
}
