import type { GlRenderState, GlRenderStateRuntime } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

type GlBooleanQuad = [boolean, boolean, boolean, boolean];
type GlBox = [number, number, number, number];

type SavedGlRenderState = {
  activeTexture: number;
  blend: boolean;
  blendDstAlpha: number;
  blendDstRgb: number;
  blendEquationAlpha: number;
  blendEquationRgb: number;
  blendSrcAlpha: number;
  blendSrcRgb: number;
  clearColor: GlBox;
  colorMask: GlBooleanQuad;
  cullFace: boolean;
  cullFaceMode: number;
  frontFace: number;
  stencilBackFail: number;
  stencilBackFunc: number;
  stencilBackPassDepthFail: number;
  stencilBackPassDepthPass: number;
  stencilBackRef: number;
  stencilBackValueMask: number;
  stencilBackWriteMask: number;
  stencilFail: number;
  stencilFunc: number;
  stencilPassDepthFail: number;
  stencilPassDepthPass: number;
  stencilRef: number;
  stencilTest: boolean;
  stencilValueMask: number;
  stencilWriteMask: number;
  currentFramebuffer: WebGLFramebuffer | null;
  currentBlendMode: GlRenderStateRuntime['currentBlendMode'];
  currentRenderTarget: GlRenderStateRuntime['currentRenderTarget'];
  currentProgram: GlRenderStateRuntime['currentProgram'];
  currentScissorRect: GlRenderStateRuntime['currentScissorRect'];
  currentTexture: GlRenderStateRuntime['currentTexture'];
  currentTextureStraightAlpha: boolean;
  depthFunc: number;
  depthMask: boolean;
  depthTest: boolean;
  framebuffer: WebGLFramebuffer | null;
  program: WebGLProgram | null;
  renderTargetViewport: GlRenderStateRuntime['renderTargetViewport'];
  scissorBox: GlBox;
  scissorTest: boolean;
  texture2DByUnit: (WebGLTexture | null)[];
  unpackPremultiplyAlpha: boolean;
  vertexArray: WebGLVertexArrayObject | null;
  viewport: GlBox;
};

// Restores the fixed-function, framebuffer, and render-gl tracked state saved by pushGlRenderState.
// The 2D root transform remains owned by the render-pass bracket: wrap a foreign offscreen draw with
// push -> beginGlRenderPass -> draw -> endGlRenderPass -> pop so the two brackets compose. Calling pop
// with no matching push is a no-op.
export function popGlRenderState(state: GlRenderState): void {
  const saved = _renderStateStack.get(state)?.pop();
  if (saved === undefined) return;

  const gl = state.gl;
  restoreGlCapability(gl, gl.DEPTH_TEST, saved.depthTest);
  gl.depthMask(saved.depthMask);
  gl.depthFunc(saved.depthFunc);

  restoreGlCapability(gl, gl.CULL_FACE, saved.cullFace);
  gl.cullFace(saved.cullFaceMode);
  // The 3D mesh path selects a front face per draw from the model determinant, so this is state
  // Flight mutates and must hand back exactly as the host left it — a host context set to CW would
  // otherwise get CCW returned.
  gl.frontFace(saved.frontFace);

  // The 2D clip system rasterizes stencil masks, and its own capture/restore inside glRenderPass is
  // scoped to FLIGHT's mask nesting — it captures only when Flight already has a clip active, and its
  // null path disables the test outright. That is correct for Flight's own nesting and says nothing
  // about the host: a caller that had STENCIL_TEST enabled would otherwise get it switched off by any
  // Flight render. This is the host-facing half.
  //
  // Restored per face, because the unsuffixed setters write FRONT_AND_BACK: restoring both faces from
  // the front's saved values would silently overwrite the back face of a host using two-sided stencil,
  // which is the case stencilOpSeparate exists for and the one Flight's own clip pass writes.
  restoreGlCapability(gl, gl.STENCIL_TEST, saved.stencilTest);
  gl.stencilMaskSeparate(gl.FRONT, saved.stencilWriteMask);
  gl.stencilMaskSeparate(gl.BACK, saved.stencilBackWriteMask);
  gl.stencilFuncSeparate(gl.FRONT, saved.stencilFunc, saved.stencilRef, saved.stencilValueMask);
  gl.stencilFuncSeparate(gl.BACK, saved.stencilBackFunc, saved.stencilBackRef, saved.stencilBackValueMask);
  gl.stencilOpSeparate(gl.FRONT, saved.stencilFail, saved.stencilPassDepthFail, saved.stencilPassDepthPass);
  gl.stencilOpSeparate(gl.BACK, saved.stencilBackFail, saved.stencilBackPassDepthFail, saved.stencilBackPassDepthPass);

  restoreGlCapability(gl, gl.BLEND, saved.blend);
  gl.blendFuncSeparate(saved.blendSrcRgb, saved.blendDstRgb, saved.blendSrcAlpha, saved.blendDstAlpha);
  gl.blendEquationSeparate(saved.blendEquationRgb, saved.blendEquationAlpha);

  gl.bindVertexArray(saved.vertexArray);
  gl.useProgram(saved.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
  for (let i = 0; i < saved.texture2DByUnit.length; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, saved.texture2DByUnit[i]);
  }
  gl.activeTexture(saved.activeTexture);

  // Pixel-write and upload state Flight sets and never puts back on its own: the 2D clip pass masks
  // colour while it rasterizes coverage, the background/velocity passes set a clear colour, and every
  // texture upload sets the premultiply flag. Each is context-wide, so a host that never called them
  // would otherwise inherit Flight's last value.
  gl.colorMask(saved.colorMask[0], saved.colorMask[1], saved.colorMask[2], saved.colorMask[3]);
  gl.clearColor(saved.clearColor[0], saved.clearColor[1], saved.clearColor[2], saved.clearColor[3]);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, saved.unpackPremultiplyAlpha);

  restoreGlCapability(gl, gl.SCISSOR_TEST, saved.scissorTest);
  gl.scissor(saved.scissorBox[0], saved.scissorBox[1], saved.scissorBox[2], saved.scissorBox[3]);
  gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);

  const runtime = getGlRenderStateRuntime(state);
  runtime.currentFramebuffer = saved.currentFramebuffer;
  runtime.currentProgram = saved.currentProgram;
  runtime.currentRenderTarget = saved.currentRenderTarget;
  runtime.currentTexture = saved.currentTexture;
  runtime.currentBlendMode = saved.currentBlendMode;
  runtime.currentScissorRect = saved.currentScissorRect;
  runtime.currentTextureStraightAlpha = saved.currentTextureStraightAlpha;
  runtime.renderTargetViewport = saved.renderTargetViewport;
}

// Flushes queued owner draws, then saves the fixed-function bindings a foreign inline renderer may
// disturb. The stack is per render state, so nested foreign draws restore in last-in-first-out order.
// Framebuffer/target/transform state belongs to beginGlRenderPass/endGlRenderPass instead.
export function pushGlRenderState(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.flushPendingDraws?.(state);

  const gl = state.gl;
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
  const texture2DByUnit: (WebGLTexture | null)[] = [];
  for (let i = 0; i < GL_RENDER_STATE_TEXTURE_UNIT_COUNT; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    texture2DByUnit.push(gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null);
  }
  gl.activeTexture(activeTexture);

  let stack = _renderStateStack.get(state);
  if (stack === undefined) {
    stack = [];
    _renderStateStack.set(state, stack);
  }
  stack.push({
    activeTexture,
    blend: gl.isEnabled(gl.BLEND),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA) as number,
    blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB) as number,
    blendEquationAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA) as number,
    blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB) as number,
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA) as number,
    blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB) as number,
    clearColor: readGlBox(gl, gl.COLOR_CLEAR_VALUE),
    colorMask: readGlBooleanQuad(gl, gl.COLOR_WRITEMASK),
    cullFace: gl.isEnabled(gl.CULL_FACE),
    cullFaceMode: gl.getParameter(gl.CULL_FACE_MODE) as number,
    frontFace: gl.getParameter(gl.FRONT_FACE) as number,
    stencilBackFail: gl.getParameter(gl.STENCIL_BACK_FAIL) as number,
    stencilBackFunc: gl.getParameter(gl.STENCIL_BACK_FUNC) as number,
    stencilBackPassDepthFail: gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_FAIL) as number,
    stencilBackPassDepthPass: gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_PASS) as number,
    stencilBackRef: gl.getParameter(gl.STENCIL_BACK_REF) as number,
    stencilBackValueMask: gl.getParameter(gl.STENCIL_BACK_VALUE_MASK) as number,
    stencilBackWriteMask: gl.getParameter(gl.STENCIL_BACK_WRITEMASK) as number,
    stencilFail: gl.getParameter(gl.STENCIL_FAIL) as number,
    stencilFunc: gl.getParameter(gl.STENCIL_FUNC) as number,
    stencilPassDepthFail: gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL) as number,
    stencilPassDepthPass: gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS) as number,
    stencilRef: gl.getParameter(gl.STENCIL_REF) as number,
    stencilTest: gl.isEnabled(gl.STENCIL_TEST),
    stencilValueMask: gl.getParameter(gl.STENCIL_VALUE_MASK) as number,
    stencilWriteMask: gl.getParameter(gl.STENCIL_WRITEMASK) as number,
    currentFramebuffer: runtime.currentFramebuffer,
    currentBlendMode: runtime.currentBlendMode,
    currentRenderTarget: runtime.currentRenderTarget,
    currentProgram: runtime.currentProgram,
    currentScissorRect: runtime.currentScissorRect,
    currentTexture: runtime.currentTexture,
    currentTextureStraightAlpha: runtime.currentTextureStraightAlpha,
    depthFunc: gl.getParameter(gl.DEPTH_FUNC) as number,
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK) as boolean,
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    renderTargetViewport: runtime.renderTargetViewport,
    scissorBox: readGlBox(gl, gl.SCISSOR_BOX),
    scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
    texture2DByUnit,
    unpackPremultiplyAlpha: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean,
    vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
    viewport: readGlBox(gl, gl.VIEWPORT),
  });
}

// Runs a synchronous foreign-rendering callback inside the fixed-function state bracket. The finally
// guarantees restoration when the callback throws; asynchronous work must place its awaited draw
// inside an explicit push/pop pair instead of returning a pending Promise from this callback.
export function withGlRenderState<T>(state: GlRenderState, callback: () => T): T {
  pushGlRenderState(state);
  try {
    return callback();
  } finally {
    popGlRenderState(state);
  }
}

function readGlBooleanQuad(gl: WebGL2RenderingContext, parameter: GLenum): GlBooleanQuad {
  const value = gl.getParameter(parameter) as ArrayLike<boolean> | null | undefined;
  // As readGlBox: browsers always return four values for COLOR_WRITEMASK. All-enabled is the GL
  // default and the conservative sentinel for a partial mock — it can never mask a host's writes off.
  if (value === null || value === undefined) return [true, true, true, true];
  return [value[0], value[1], value[2], value[3]];
}

function readGlBox(gl: WebGL2RenderingContext, parameter: GLenum): GlBox {
  const value = gl.getParameter(parameter) as ArrayLike<number> | null | undefined;
  // Lightweight test contexts may omit inert query state. Browsers always return four values for
  // VIEWPORT/SCISSOR_BOX; a zero box is the conservative restoration sentinel for a partial mock.
  if (value === null || value === undefined) return [0, 0, 0, 0];
  return [value[0], value[1], value[2], value[3]];
}

function restoreGlCapability(gl: WebGL2RenderingContext, capability: GLenum, enabled: boolean): void {
  if (enabled) {
    gl.enable(capability);
  } else {
    gl.disable(capability);
  }
}

// The fixed-function state stack is keyed by render state, matching the render-pass bracket: two
// render states sharing a GL context still have independent ownership/nesting scopes.
const _renderStateStack = new WeakMap<GlRenderState, SavedGlRenderState[]>();
// The 2D GL pipelines use units 0-2: the primary image plus two auxiliary effect inputs.
const GL_RENDER_STATE_TEXTURE_UNIT_COUNT = 3;
