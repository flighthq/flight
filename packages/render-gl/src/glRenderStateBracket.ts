import type { GlRenderState, GlRenderStateRuntime } from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

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
  cullFace: boolean;
  cullFaceMode: number;
  currentBlendMode: GlRenderStateRuntime['currentBlendMode'];
  currentProgram: GlRenderStateRuntime['currentProgram'];
  currentScissorRect: GlRenderStateRuntime['currentScissorRect'];
  currentTexture: GlRenderStateRuntime['currentTexture'];
  currentTextureStraightAlpha: boolean;
  depthFunc: number;
  depthMask: boolean;
  depthTest: boolean;
  program: WebGLProgram | null;
  scissorBox: GlBox;
  scissorTest: boolean;
  texture2D: WebGLTexture | null;
  vertexArray: WebGLVertexArrayObject | null;
  viewport: GlBox;
};

// Restores the fixed-function and render-gl tracked state saved by pushGlRenderState. This does not
// restore framebuffer, render-target viewport ownership, or the 2D root transform: wrap a foreign
// offscreen draw with push -> beginGlRenderPass -> draw -> endGlRenderPass -> pop so the two brackets
// compose. Calling pop with no matching push is a no-op.
export function popGlRenderState(state: GlRenderState): void {
  const saved = _renderStateStack.get(state)?.pop();
  if (saved === undefined) return;

  const gl = state.gl;
  restoreGlCapability(gl, gl.DEPTH_TEST, saved.depthTest);
  gl.depthMask(saved.depthMask);
  gl.depthFunc(saved.depthFunc);

  restoreGlCapability(gl, gl.CULL_FACE, saved.cullFace);
  gl.cullFace(saved.cullFaceMode);

  restoreGlCapability(gl, gl.BLEND, saved.blend);
  gl.blendFuncSeparate(saved.blendSrcRgb, saved.blendDstRgb, saved.blendSrcAlpha, saved.blendDstAlpha);
  gl.blendEquationSeparate(saved.blendEquationRgb, saved.blendEquationAlpha);

  gl.bindVertexArray(saved.vertexArray);
  gl.useProgram(saved.program);
  gl.activeTexture(saved.activeTexture);
  gl.bindTexture(gl.TEXTURE_2D, saved.texture2D);

  restoreGlCapability(gl, gl.SCISSOR_TEST, saved.scissorTest);
  gl.scissor(saved.scissorBox[0], saved.scissorBox[1], saved.scissorBox[2], saved.scissorBox[3]);
  gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);

  const runtime = getGlRenderStateRuntime(state);
  runtime.currentProgram = saved.currentProgram;
  runtime.currentTexture = saved.currentTexture;
  runtime.currentBlendMode = saved.currentBlendMode;
  runtime.currentScissorRect = saved.currentScissorRect;
  runtime.currentTextureStraightAlpha = saved.currentTextureStraightAlpha;
}

// Flushes queued owner draws, then saves the fixed-function bindings a foreign inline renderer may
// disturb. The stack is per render state, so nested foreign draws restore in last-in-first-out order.
// Framebuffer/target/transform state belongs to beginGlRenderPass/endGlRenderPass instead.
export function pushGlRenderState(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.flushPendingDraws?.(state);

  const gl = state.gl;
  let stack = _renderStateStack.get(state);
  if (stack === undefined) {
    stack = [];
    _renderStateStack.set(state, stack);
  }
  stack.push({
    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
    blend: gl.isEnabled(gl.BLEND),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA) as number,
    blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB) as number,
    blendEquationAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA) as number,
    blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB) as number,
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA) as number,
    blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB) as number,
    cullFace: gl.isEnabled(gl.CULL_FACE),
    cullFaceMode: gl.getParameter(gl.CULL_FACE_MODE) as number,
    currentBlendMode: runtime.currentBlendMode,
    currentProgram: runtime.currentProgram,
    currentScissorRect: runtime.currentScissorRect,
    currentTexture: runtime.currentTexture,
    currentTextureStraightAlpha: runtime.currentTextureStraightAlpha,
    depthFunc: gl.getParameter(gl.DEPTH_FUNC) as number,
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK) as boolean,
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    scissorBox: readGlBox(gl, gl.SCISSOR_BOX),
    scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
    texture2D: gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
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

function readGlBox(gl: WebGL2RenderingContext, parameter: GLenum): GlBox {
  const value = gl.getParameter(parameter) as ArrayLike<number>;
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
