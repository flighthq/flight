import type {
  GlBlendSignature,
  GlRenderStateRuntime,
  GlRenderTarget,
  GlScissorRect,
  GlViewportRect,
} from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';
import { popGlRenderState, pushGlRenderState, withGlRenderState } from './glRenderStateBracket';
import { createGlState } from './glTestHelper';

type TestGlState = {
  activeTexture: number;
  blend: boolean;
  blendDstAlpha: number;
  blendDstRgb: number;
  blendEquationAlpha: number;
  blendEquationRgb: number;
  blendSignature: GlBlendSignature | null;
  blendSrcAlpha: number;
  blendSrcRgb: number;
  cullFace: boolean;
  cullFaceMode: number;
  frontFace: number;
  stencilTest: boolean;
  stencilWriteMask: number;
  currentRenderTarget: GlRenderTarget | null;
  depthFunc: number;
  depthMask: boolean;
  depthTest: boolean;
  framebuffer: WebGLFramebuffer | null;
  program: WebGLProgram | null;
  renderTargetViewport: GlViewportRect | null;
  scissorBox: [number, number, number, number];
  scissorRect: GlScissorRect | null;
  scissorTest: boolean;
  straightAlpha: boolean;
  texture: WebGLTexture | null;
  vertexArray: WebGLVertexArrayObject | null;
  viewport: [number, number, number, number];
};

type StatefulGl = {
  gl: WebGL2RenderingContext;
  parameters: Map<number, unknown>;
  runtime: GlRenderStateRuntime;
  textureBindings: Map<number, WebGLTexture | null>;
};

const OUTER_STATE: TestGlState = {
  activeTexture: 0x84c1,
  blend: true,
  blendDstAlpha: 0x0303,
  blendDstRgb: 0x0303,
  blendEquationAlpha: 0x8006,
  blendEquationRgb: 0x8006,
  blendSignature: { dst: 0x0303, equation: 0x8006, src: 1 },
  blendSrcAlpha: 1,
  blendSrcRgb: 1,
  cullFace: false,
  cullFaceMode: 0x0405,
  frontFace: 0x0900, // GL_CW — a host that does not use Flight's default
  stencilTest: true, // enabled on purpose: a fixture that starts disabled cannot tell 'restored' from 'left off'
  stencilWriteMask: 0x0f,
  currentRenderTarget: { name: 'outer-target' } as unknown as GlRenderTarget,
  depthFunc: 0x0203,
  depthMask: false,
  depthTest: true,
  framebuffer: { name: 'outer-framebuffer' } as unknown as WebGLFramebuffer,
  program: { name: 'outer-program' } as unknown as WebGLProgram,
  renderTargetViewport: { height: 220, width: 300, x: 4, y: 5 },
  scissorBox: [2, 3, 40, 50],
  scissorRect: { x: 2, y: 3, width: 40, height: 50 },
  scissorTest: true,
  straightAlpha: true,
  texture: { name: 'outer-texture' } as unknown as WebGLTexture,
  vertexArray: { name: 'outer-vao' } as unknown as WebGLVertexArrayObject,
  viewport: [4, 5, 320, 240],
};

const MIDDLE_STATE: TestGlState = {
  activeTexture: 0x84c2,
  blend: false,
  blendDstAlpha: 0,
  blendDstRgb: 0,
  blendEquationAlpha: 0x800b,
  blendEquationRgb: 0x800b,
  blendSignature: { dst: 0, equation: 0x800b, src: 1 },
  blendSrcAlpha: 1,
  blendSrcRgb: 1,
  cullFace: true,
  cullFaceMode: 0x0404,
  frontFace: 0x0901, // GL_CCW
  stencilTest: false,
  stencilWriteMask: 0xff,
  currentRenderTarget: { name: 'middle-target' } as unknown as GlRenderTarget,
  depthFunc: 0x0201,
  depthMask: true,
  depthTest: false,
  framebuffer: { name: 'middle-framebuffer' } as unknown as WebGLFramebuffer,
  program: { name: 'middle-program' } as unknown as WebGLProgram,
  renderTargetViewport: { height: 460, width: 620, x: 8, y: 9 },
  scissorBox: [6, 7, 80, 90],
  scissorRect: { x: 6, y: 7, width: 80, height: 90 },
  scissorTest: false,
  straightAlpha: false,
  texture: { name: 'middle-texture' } as unknown as WebGLTexture,
  vertexArray: { name: 'middle-vao' } as unknown as WebGLVertexArrayObject,
  viewport: [8, 9, 640, 480],
};

const INNER_STATE: TestGlState = {
  ...OUTER_STATE,
  activeTexture: 0x84c3,
  blendSignature: { dst: 0x0303, equation: 0x8006, src: 1 },
  currentRenderTarget: { name: 'inner-target' } as unknown as GlRenderTarget,
  framebuffer: { name: 'inner-framebuffer' } as unknown as WebGLFramebuffer,
  program: { name: 'inner-program' } as unknown as WebGLProgram,
  renderTargetViewport: { height: 200, width: 280, x: 10, y: 11 },
  scissorRect: { x: 10, y: 11, width: 12, height: 13 },
  texture: { name: 'inner-texture' } as unknown as WebGLTexture,
  vertexArray: { name: 'inner-vao' } as unknown as WebGLVertexArrayObject,
};

describe('popGlRenderState', () => {
  it('is a no-op when there is no matching push', () => {
    const { state, gl } = createGlState();

    popGlRenderState(state);

    expect(gl.enable).not.toHaveBeenCalled();
    expect(gl.disable).not.toHaveBeenCalled();
  });

  it('restores every guarded fixed-function binding and tracked runtime field', () => {
    const fixture = createStatefulGl();
    applyTestGlState(fixture, OUTER_STATE);
    pushGlRenderState(fixture.state);

    applyTestGlState(fixture, MIDDLE_STATE);
    popGlRenderState(fixture.state);

    expectTestGlState(fixture, OUTER_STATE);
  });

  it('restores a two-sided stencil configuration without collapsing the back face onto the front', () => {
    const fixture = createStatefulGl();
    const gl = fixture.gl;
    applyTestGlState(fixture, OUTER_STATE);
    // A host driving two-sided stencil — the case stencilOpSeparate exists for. Every back-face value
    // differs from its front counterpart, so a restore that writes both faces from the front's saved
    // values cannot pass by coincidence: it would report the front correct and the back overwritten.
    gl.stencilOpSeparate(gl.FRONT, 0x1e00, 0x1e00, 0x1e01); // KEEP, KEEP, REPLACE
    gl.stencilOpSeparate(gl.BACK, 0x1e02, 0x1e03, 0x150a); // INCR, DECR, INVERT
    gl.stencilFuncSeparate(gl.FRONT, 0x0201, 1, 0xf0); // LESS
    gl.stencilFuncSeparate(gl.BACK, 0x0204, 2, 0x0f); // GREATER
    gl.stencilMaskSeparate(gl.FRONT, 0xaa);
    gl.stencilMaskSeparate(gl.BACK, 0x55);
    const host = new Map(fixture.parameters);
    pushGlRenderState(fixture.state);

    // What Flight's own 2D clip pass writes: separate wrap ops per face, then a symmetric gate.
    gl.stencilOpSeparate(gl.FRONT, 0x1e00, 0x1e00, 0x8507); // INCR_WRAP
    gl.stencilOpSeparate(gl.BACK, 0x1e00, 0x1e00, 0x8508); // DECR_WRAP
    gl.stencilFunc(0x0207, 0, 0xff); // ALWAYS, both faces
    gl.stencilMask(0xff);
    popGlRenderState(fixture.state);

    for (const parameter of TWO_SIDED_STENCIL_PARAMETERS) {
      expect([parameter, fixture.parameters.get(gl[parameter])]).toEqual([parameter, host.get(gl[parameter])]);
    }
  });

  it('restores colour-write, clear-colour, and upload-premultiply state Flight leaves behind', () => {
    const fixture = createStatefulGl();
    const gl = fixture.gl;
    applyTestGlState(fixture, OUTER_STATE);
    // A host whose own settings all differ from both the GL defaults and from what Flight will set,
    // so neither 'never restored' nor 'reset to the default' can pass as restoration.
    gl.colorMask(true, false, true, false);
    gl.clearColor(0.25, 0.5, 0.75, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    pushGlRenderState(fixture.state);

    // What Flight's own passes do: mask colour off while rasterizing clip coverage, clear a target,
    // and premultiply a texture upload. None of these puts the previous value back.
    gl.colorMask(false, false, false, false);
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    popGlRenderState(fixture.state);

    expect(fixture.parameters.get(gl.COLOR_WRITEMASK)).toEqual([true, false, true, false]);
    expect(fixture.parameters.get(gl.COLOR_CLEAR_VALUE)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(fixture.parameters.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(false);
  });

  it('restores a non-active texture unit binding', () => {
    const fixture = createStatefulGl();
    applyTestGlState(fixture, OUTER_STATE);
    const savedActiveTexture = fixture.parameters.get(fixture.gl.ACTIVE_TEXTURE);
    const texture = { name: 'unit-two-texture' } as unknown as WebGLTexture;
    const textureUnit = fixture.gl.TEXTURE0 + 2;
    fixture.gl.activeTexture(textureUnit);
    fixture.gl.bindTexture(fixture.gl.TEXTURE_2D, texture);
    fixture.gl.activeTexture(savedActiveTexture as number);
    pushGlRenderState(fixture.state);

    fixture.gl.activeTexture(textureUnit);
    fixture.gl.bindTexture(fixture.gl.TEXTURE_2D, null);
    popGlRenderState(fixture.state);

    expect(fixture.textureBindings.get(textureUnit)).toBe(texture);
    expect(fixture.parameters.get(fixture.gl.ACTIVE_TEXTURE)).toBe(savedActiveTexture);
  });

  it('restores nested pushes in last-in-first-out order', () => {
    const fixture = createStatefulGl();
    applyTestGlState(fixture, OUTER_STATE);
    pushGlRenderState(fixture.state);
    applyTestGlState(fixture, MIDDLE_STATE);
    pushGlRenderState(fixture.state);
    applyTestGlState(fixture, INNER_STATE);

    popGlRenderState(fixture.state);
    expectTestGlState(fixture, MIDDLE_STATE);
    popGlRenderState(fixture.state);
    expectTestGlState(fixture, OUTER_STATE);
  });
});

describe('pushGlRenderState', () => {
  it('flushes pending owner draws before taking the snapshot', () => {
    const fixture = createStatefulGl();
    applyTestGlState(fixture, OUTER_STATE);
    const flush = vi.fn();
    fixture.runtime.flushPendingDraws = flush;

    pushGlRenderState(fixture.state);

    expect(flush).toHaveBeenCalledWith(fixture.state);
    popGlRenderState(fixture.state);
  });
});

describe('withGlRenderState', () => {
  it('restores state in finally when the foreign callback throws', () => {
    const fixture = createStatefulGl();
    applyTestGlState(fixture, OUTER_STATE);

    expect(() =>
      withGlRenderState(fixture.state, () => {
        applyTestGlState(fixture, INNER_STATE);
        throw new Error('foreign draw failed');
      }),
    ).toThrow('foreign draw failed');

    expectTestGlState(fixture, OUTER_STATE);
  });
});

function applyTestGlState(fixture: StatefulGl, values: Readonly<TestGlState>): void {
  const { gl, runtime } = fixture;
  setCapability(gl, gl.DEPTH_TEST, values.depthTest);
  gl.depthMask(values.depthMask);
  gl.depthFunc(values.depthFunc);
  setCapability(gl, gl.CULL_FACE, values.cullFace);
  gl.cullFace(values.cullFaceMode);
  gl.frontFace(values.frontFace);
  setCapability(gl, gl.STENCIL_TEST, values.stencilTest);
  gl.stencilMask(values.stencilWriteMask);
  setCapability(gl, gl.BLEND, values.blend);
  gl.blendFuncSeparate(values.blendSrcRgb, values.blendDstRgb, values.blendSrcAlpha, values.blendDstAlpha);
  gl.blendEquationSeparate(values.blendEquationRgb, values.blendEquationAlpha);
  gl.bindVertexArray(values.vertexArray);
  gl.useProgram(values.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, values.framebuffer);
  gl.activeTexture(values.activeTexture);
  gl.bindTexture(gl.TEXTURE_2D, values.texture);
  setCapability(gl, gl.SCISSOR_TEST, values.scissorTest);
  gl.scissor(values.scissorBox[0], values.scissorBox[1], values.scissorBox[2], values.scissorBox[3]);
  gl.viewport(values.viewport[0], values.viewport[1], values.viewport[2], values.viewport[3]);
  runtime.currentBlendSignature = values.blendSignature;
  runtime.currentFramebuffer = values.framebuffer;
  runtime.currentRenderTarget = values.currentRenderTarget;
  runtime.currentShader = values.program === null ? null : { locations: null, program: values.program };
  runtime.currentScissorRect = values.scissorRect;
  runtime.currentTextureRealization =
    values.texture === null ? null : { straightAlpha: values.straightAlpha, texture: values.texture };
  runtime.renderTargetViewport = values.renderTargetViewport;
}

function createStatefulGl(): StatefulGl & ReturnType<typeof createGlState> {
  const fixture = createGlState();
  const { gl, state } = fixture;
  Object.assign(gl, {
    ACTIVE_TEXTURE: 0x84e0,
    BLEND_DST_ALPHA: 0x80ca,
    BLEND_DST_RGB: 0x80c8,
    BLEND_EQUATION_ALPHA: 0x883d,
    BLEND_EQUATION_RGB: 0x8009,
    BLEND_SRC_ALPHA: 0x80cb,
    BLEND_SRC_RGB: 0x80c9,
    CULL_FACE_MODE: 0x0b45,
    CURRENT_PROGRAM: 0x8b8d,
    DEPTH_FUNC: 0x0b74,
    DEPTH_WRITEMASK: 0x0b72,
    FRAMEBUFFER_BINDING: 0x8ca6,
    FRONT_FACE: 0x0b46,
    BACK: 0x0405,
    COLOR_CLEAR_VALUE: 0x0c22,
    COLOR_WRITEMASK: 0x0c23,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    FRONT: 0x0404,
    STENCIL_BACK_FAIL: 0x8801,
    STENCIL_BACK_FUNC: 0x8800,
    STENCIL_BACK_PASS_DEPTH_FAIL: 0x8802,
    STENCIL_BACK_PASS_DEPTH_PASS: 0x8803,
    STENCIL_BACK_REF: 0x8ca3,
    STENCIL_BACK_VALUE_MASK: 0x8ca4,
    STENCIL_BACK_WRITEMASK: 0x8ca5,
    STENCIL_FAIL: 0x0b94,
    STENCIL_FUNC: 0x0b92,
    STENCIL_PASS_DEPTH_FAIL: 0x0b95,
    STENCIL_PASS_DEPTH_PASS: 0x0b96,
    STENCIL_REF: 0x0b97,
    STENCIL_TEST: 0x0b90,
    STENCIL_VALUE_MASK: 0x0b93,
    STENCIL_WRITEMASK: 0x0b98,
    SCISSOR_BOX: 0x0c10,
    TEXTURE_BINDING_2D: 0x8069,
    VERTEX_ARRAY_BINDING: 0x85b5,
    VIEWPORT: 0x0ba2,
  });

  const enabled = new Set<number>();
  const parameters = new Map<number, unknown>();
  const textureBindings = new Map<number, WebGLTexture | null>();
  (gl.isEnabled as ReturnType<typeof vi.fn>).mockImplementation((capability: number) => enabled.has(capability));
  (gl.getParameter as ReturnType<typeof vi.fn>).mockImplementation((parameter: number) => {
    if (parameter === gl.TEXTURE_BINDING_2D) {
      return textureBindings.get(parameters.get(gl.ACTIVE_TEXTURE) as number) ?? null;
    }
    return parameters.get(parameter);
  });
  (gl.enable as ReturnType<typeof vi.fn>).mockImplementation((capability: number) => enabled.add(capability));
  (gl.disable as ReturnType<typeof vi.fn>).mockImplementation((capability: number) => enabled.delete(capability));
  (gl.depthMask as ReturnType<typeof vi.fn>).mockImplementation((value: boolean) =>
    parameters.set(gl.DEPTH_WRITEMASK, value),
  );
  (gl.depthFunc as ReturnType<typeof vi.fn>).mockImplementation((value: number) =>
    parameters.set(gl.DEPTH_FUNC, value),
  );
  (gl.cullFace as ReturnType<typeof vi.fn>).mockImplementation((value: number) =>
    parameters.set(gl.CULL_FACE_MODE, value),
  );
  (gl.frontFace as ReturnType<typeof vi.fn>).mockImplementation((value: number) =>
    parameters.set(gl.FRONT_FACE, value),
  );
  (gl.colorMask as ReturnType<typeof vi.fn>).mockImplementation((r: boolean, g: boolean, b: boolean, a: boolean) =>
    parameters.set(gl.COLOR_WRITEMASK, [r, g, b, a]),
  );
  (gl.clearColor as ReturnType<typeof vi.fn>).mockImplementation((r: number, g: number, b: number, a: number) =>
    parameters.set(gl.COLOR_CLEAR_VALUE, [r, g, b, a]),
  );
  (gl.pixelStorei as ReturnType<typeof vi.fn>).mockImplementation((parameter: number, value: unknown) =>
    parameters.set(parameter, value),
  );
  // Stencil is two-faced state: the unsuffixed setters write FRONT_AND_BACK while the Separate ones
  // write only the named face. That rule was measured against a real WebGL2 context rather than assumed
  // here — a fake cannot be the oracle for the API it fakes. `null` is the unsuffixed, both-faces form.
  const writeStencilMask = (face: number | null, value: number): void => {
    if (face !== gl.BACK) parameters.set(gl.STENCIL_WRITEMASK, value);
    if (face !== gl.FRONT) parameters.set(gl.STENCIL_BACK_WRITEMASK, value);
  };
  const writeStencilFunc = (face: number | null, func: number, ref: number, mask: number): void => {
    if (face !== gl.BACK) {
      parameters.set(gl.STENCIL_FUNC, func);
      parameters.set(gl.STENCIL_REF, ref);
      parameters.set(gl.STENCIL_VALUE_MASK, mask);
    }
    if (face !== gl.FRONT) {
      parameters.set(gl.STENCIL_BACK_FUNC, func);
      parameters.set(gl.STENCIL_BACK_REF, ref);
      parameters.set(gl.STENCIL_BACK_VALUE_MASK, mask);
    }
  };
  const writeStencilOp = (face: number | null, fail: number, depthFail: number, depthPass: number): void => {
    if (face !== gl.BACK) {
      parameters.set(gl.STENCIL_FAIL, fail);
      parameters.set(gl.STENCIL_PASS_DEPTH_FAIL, depthFail);
      parameters.set(gl.STENCIL_PASS_DEPTH_PASS, depthPass);
    }
    if (face !== gl.FRONT) {
      parameters.set(gl.STENCIL_BACK_FAIL, fail);
      parameters.set(gl.STENCIL_BACK_PASS_DEPTH_FAIL, depthFail);
      parameters.set(gl.STENCIL_BACK_PASS_DEPTH_PASS, depthPass);
    }
  };
  (gl.stencilMask as ReturnType<typeof vi.fn>).mockImplementation((value: number) => writeStencilMask(null, value));
  (gl.stencilMaskSeparate as ReturnType<typeof vi.fn>).mockImplementation((face: number, value: number) =>
    writeStencilMask(face, value),
  );
  (gl.stencilFunc as ReturnType<typeof vi.fn>).mockImplementation((func: number, ref: number, mask: number) =>
    writeStencilFunc(null, func, ref, mask),
  );
  (gl.stencilFuncSeparate as ReturnType<typeof vi.fn>).mockImplementation(
    (face: number, func: number, ref: number, mask: number) => writeStencilFunc(face, func, ref, mask),
  );
  (gl.stencilOp as ReturnType<typeof vi.fn>).mockImplementation((fail: number, dFail: number, dPass: number) =>
    writeStencilOp(null, fail, dFail, dPass),
  );
  (gl.stencilOpSeparate as ReturnType<typeof vi.fn>).mockImplementation(
    (face: number, fail: number, dFail: number, dPass: number) => writeStencilOp(face, fail, dFail, dPass),
  );
  (gl.blendFuncSeparate as ReturnType<typeof vi.fn>).mockImplementation(
    (srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number) => {
      parameters.set(gl.BLEND_SRC_RGB, srcRgb);
      parameters.set(gl.BLEND_DST_RGB, dstRgb);
      parameters.set(gl.BLEND_SRC_ALPHA, srcAlpha);
      parameters.set(gl.BLEND_DST_ALPHA, dstAlpha);
    },
  );
  (gl.blendEquationSeparate as ReturnType<typeof vi.fn>).mockImplementation((rgb: number, alpha: number) => {
    parameters.set(gl.BLEND_EQUATION_RGB, rgb);
    parameters.set(gl.BLEND_EQUATION_ALPHA, alpha);
  });
  (gl.bindVertexArray as ReturnType<typeof vi.fn>).mockImplementation((value: WebGLVertexArrayObject | null) =>
    parameters.set(gl.VERTEX_ARRAY_BINDING, value),
  );
  (gl.useProgram as ReturnType<typeof vi.fn>).mockImplementation((value: WebGLProgram | null) =>
    parameters.set(gl.CURRENT_PROGRAM, value),
  );
  (gl.bindFramebuffer as ReturnType<typeof vi.fn>).mockImplementation(
    (_target: number, value: WebGLFramebuffer | null) => parameters.set(gl.FRAMEBUFFER_BINDING, value),
  );
  (gl.activeTexture as ReturnType<typeof vi.fn>).mockImplementation((value: number) =>
    parameters.set(gl.ACTIVE_TEXTURE, value),
  );
  (gl.bindTexture as ReturnType<typeof vi.fn>).mockImplementation((_target: number, value: WebGLTexture | null) => {
    textureBindings.set(parameters.get(gl.ACTIVE_TEXTURE) as number, value);
  });
  (gl.scissor as ReturnType<typeof vi.fn>).mockImplementation((x: number, y: number, width: number, height: number) =>
    parameters.set(gl.SCISSOR_BOX, [x, y, width, height]),
  );
  (gl.viewport as ReturnType<typeof vi.fn>).mockImplementation((x: number, y: number, width: number, height: number) =>
    parameters.set(gl.VIEWPORT, [x, y, width, height]),
  );

  return { ...fixture, parameters, runtime: getGlRenderStateRuntime(state), textureBindings };
}

function expectTestGlState(fixture: StatefulGl, expected: Readonly<TestGlState>): void {
  const { gl, parameters, runtime } = fixture;
  expect(gl.isEnabled(gl.DEPTH_TEST)).toBe(expected.depthTest);
  expect(parameters.get(gl.DEPTH_WRITEMASK)).toBe(expected.depthMask);
  expect(parameters.get(gl.DEPTH_FUNC)).toBe(expected.depthFunc);
  expect(gl.isEnabled(gl.CULL_FACE)).toBe(expected.cullFace);
  expect(parameters.get(gl.CULL_FACE_MODE)).toBe(expected.cullFaceMode);
  // The 3D mesh path picks a front face per draw from the model determinant, so this is state Flight
  // mutates and must hand back untouched — a host set to CW must not get CCW returned.
  expect(parameters.get(gl.FRONT_FACE)).toBe(expected.frontFace);
  // Flight's 2D clip system rasterizes stencil masks; its internal restore is scoped to Flight's own
  // nesting and disables the test outright when Flight had no clip, so the host-facing preservation
  // has to happen here. The outer fixture starts ENABLED so 'restored' is distinguishable from 'left off'.
  expect(gl.isEnabled(gl.STENCIL_TEST)).toBe(expected.stencilTest);
  expect(parameters.get(gl.STENCIL_WRITEMASK)).toBe(expected.stencilWriteMask);
  expect(gl.isEnabled(gl.BLEND)).toBe(expected.blend);
  expect(parameters.get(gl.BLEND_SRC_RGB)).toBe(expected.blendSrcRgb);
  expect(parameters.get(gl.BLEND_DST_RGB)).toBe(expected.blendDstRgb);
  expect(parameters.get(gl.BLEND_SRC_ALPHA)).toBe(expected.blendSrcAlpha);
  expect(parameters.get(gl.BLEND_DST_ALPHA)).toBe(expected.blendDstAlpha);
  expect(parameters.get(gl.BLEND_EQUATION_RGB)).toBe(expected.blendEquationRgb);
  expect(parameters.get(gl.BLEND_EQUATION_ALPHA)).toBe(expected.blendEquationAlpha);
  expect(parameters.get(gl.VERTEX_ARRAY_BINDING)).toBe(expected.vertexArray);
  expect(parameters.get(gl.CURRENT_PROGRAM)).toBe(expected.program);
  expect(parameters.get(gl.FRAMEBUFFER_BINDING)).toBe(expected.framebuffer);
  expect(parameters.get(gl.ACTIVE_TEXTURE)).toBe(expected.activeTexture);
  expect(fixture.textureBindings.get(expected.activeTexture)).toBe(expected.texture);
  expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(expected.scissorTest);
  expect(parameters.get(gl.SCISSOR_BOX)).toEqual(expected.scissorBox);
  expect(parameters.get(gl.VIEWPORT)).toEqual(expected.viewport);
  expect(runtime.currentBlendSignature).toEqual(expected.blendSignature);
  expect(runtime.currentFramebuffer).toBe(expected.framebuffer);
  expect(runtime.currentRenderTarget).toBe(expected.currentRenderTarget);
  expect(runtime.currentShader?.program ?? null).toBe(expected.program);
  expect(runtime.currentScissorRect).toBe(expected.scissorRect);
  expect(runtime.currentTextureRealization?.texture ?? null).toBe(expected.texture);
  expect(runtime.currentTextureRealization?.straightAlpha ?? false).toBe(expected.straightAlpha);
  expect(runtime.renderTargetViewport).toBe(expected.renderTargetViewport);
}

function setCapability(gl: WebGL2RenderingContext, capability: number, enabled: boolean): void {
  if (enabled) {
    gl.enable(capability);
  } else {
    gl.disable(capability);
  }
}

// Both faces of every stencil parameter the bracket saves. Naming them here rather than asserting a
// handful keeps the list checkable against the saved-state fields by eye.
const TWO_SIDED_STENCIL_PARAMETERS = [
  'STENCIL_FAIL',
  'STENCIL_BACK_FAIL',
  'STENCIL_PASS_DEPTH_FAIL',
  'STENCIL_BACK_PASS_DEPTH_FAIL',
  'STENCIL_PASS_DEPTH_PASS',
  'STENCIL_BACK_PASS_DEPTH_PASS',
  'STENCIL_FUNC',
  'STENCIL_BACK_FUNC',
  'STENCIL_REF',
  'STENCIL_BACK_REF',
  'STENCIL_VALUE_MASK',
  'STENCIL_BACK_VALUE_MASK',
  'STENCIL_WRITEMASK',
  'STENCIL_BACK_WRITEMASK',
] as const;
