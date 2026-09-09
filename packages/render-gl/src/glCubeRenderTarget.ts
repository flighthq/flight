import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  GlCubeRenderTarget,
  GlCubeRenderTargetOptions,
  GlRenderState,
  GlRenderStateRuntime,
  GlViewportRect,
} from '@flighthq/types/contract';

import { getGlRenderStateRuntime } from './glRenderState';

interface SavedGlCubeFaceState {
  clipForms: ('rect' | 'contour')[];
  currentFramebuffer: WebGLFramebuffer | null;
  currentMaskDepth: number;
  currentRenderTarget: GlRenderStateRuntime['currentRenderTarget'];
  currentScissorRect: GlRenderStateRuntime['currentScissorRect'];
  depthMask: boolean;
  framebuffer: WebGLFramebuffer | null;
  renderTargetViewport: GlViewportRect | null;
  scissorBox: [number, number, number, number];
  scissorStack: GlRenderStateRuntime['scissorStack'];
  scissorTest: boolean;
  stencilTest: boolean;
  viewport: [number, number, number, number];
}

// Binds one cubemap face as the current color attachment, establishes a full-face viewport, and
// clears color plus the optional depth-stencil attachment. Pair with endGlCubeRenderFace. Face order
// is +X, -X, +Y, -Y, +Z, -Z, matching WebGL's consecutive cubemap-face targets.
export function beginGlCubeRenderFace(state: GlRenderState, target: GlCubeRenderTarget, face: number): void {
  if (!Number.isInteger(face) || face < 0 || face >= 6) {
    throw new RangeError('beginGlCubeRenderFace face must be an integer from 0 through 5');
  }

  const gl = state.gl;
  const runtime = getGlRenderStateRuntime(state);
  runtime.flushPendingDraws?.(state);
  const saved: SavedGlCubeFaceState = {
    clipForms: [...runtime.clipForms],
    currentFramebuffer: runtime.currentFramebuffer,
    currentMaskDepth: runtime.currentMaskDepth ?? 0,
    currentRenderTarget: runtime.currentRenderTarget,
    currentScissorRect: runtime.currentScissorRect,
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK) !== false,
    framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    renderTargetViewport: runtime.renderTargetViewport,
    scissorBox: readGlCubeFaceBox(gl, gl.SCISSOR_BOX),
    scissorStack: [...(runtime.scissorStack ?? [])],
    scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
    stencilTest: gl.isEnabled(gl.STENCIL_TEST),
    viewport: readGlCubeFaceBox(gl, gl.VIEWPORT),
  };
  let stack = glCubeFaceStacks.get(state);
  if (stack === undefined) {
    stack = [];
    glCubeFaceStacks.set(state, stack);
  }
  stack.push(saved);

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
    target.texture,
    0,
  );
  gl.viewport(0, 0, target.size, target.size);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);

  runtime.currentFramebuffer = target.framebuffer;
  runtime.currentRenderTarget = target;
  runtime.renderTargetViewport = targetViewport(target.size);
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];
  runtime.clipForms = [];
  runtime.currentMaskDepth = 0;
  invalidateGlCubeFaceBindingCache(runtime);

  resolveGlCubeFaceClearColor(state, clearRgba);
  gl.clearBufferfv(gl.COLOR, 0, clearRgba);
  if (target.depthStencilRenderbuffer !== null) {
    gl.depthMask(true);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
  }
}

// Allocates one RGBA16F cubemap texture plus a reusable face framebuffer. A depth-stencil attachment
// is allocated by default; `{ depth: false }` creates a color-only target. Storage is single-sample —
// cubemap convolution provides the filtering normally sought from MSAA at this stage.
export function createGlCubeRenderTarget(
  state: GlRenderState,
  size: number,
  options?: Readonly<GlCubeRenderTargetOptions>,
): GlCubeRenderTarget {
  const gl = state.gl;
  const normalizedSize = Math.max(1, Math.ceil(size));
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
  const previousCubeTexture = gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP) as WebGLTexture | null;

  const framebuffer = gl.createFramebuffer()!;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  for (let face = 0; face < 6; face++) {
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      0,
      gl.RGBA16F,
      normalizedSize,
      normalizedSize,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, texture, 0);

  let depthStencilRenderbuffer: WebGLRenderbuffer | null = null;
  if (options?.depth !== false) {
    depthStencilRenderbuffer = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthStencilRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, normalizedSize, normalizedSize);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthStencilRenderbuffer);
  }

  const target = allocateEntity<GlCubeRenderTarget>();
  initializeGlCubeRenderTarget(target, normalizedSize, framebuffer, texture, depthStencilRenderbuffer);
  finishEntity(target);

  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, previousCubeTexture);
  return target;
}

// Frees the cubemap texture, framebuffer, and optional depth-stencil buffer owned by `target`.
export function destroyGlCubeRenderTarget(state: GlRenderState, target: GlCubeRenderTarget): void {
  const gl = state.gl;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
  if (target.depthStencilRenderbuffer !== null) gl.deleteRenderbuffer(target.depthStencilRenderbuffer);
}

// Restores the exact framebuffer, viewport, scissor/stencil gate, depth mask, and tracked render-target
// state captured by beginGlCubeRenderFace. A missing begin is a programmer error.
export function endGlCubeRenderFace(state: GlRenderState): void {
  const stack = glCubeFaceStacks.get(state);
  const saved = stack?.pop();
  if (saved === undefined) throw new Error('endGlCubeRenderFace called without a matching beginGlCubeRenderFace');
  if (stack!.length === 0) glCubeFaceStacks.delete(state);

  const gl = state.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
  gl.viewport(saved.viewport[0], saved.viewport[1], saved.viewport[2], saved.viewport[3]);
  restoreGlCubeFaceCapability(gl, gl.SCISSOR_TEST, saved.scissorTest);
  gl.scissor(saved.scissorBox[0], saved.scissorBox[1], saved.scissorBox[2], saved.scissorBox[3]);
  restoreGlCubeFaceCapability(gl, gl.STENCIL_TEST, saved.stencilTest);
  gl.depthMask(saved.depthMask);

  const runtime = getGlRenderStateRuntime(state);
  runtime.currentFramebuffer = saved.currentFramebuffer;
  runtime.currentRenderTarget = saved.currentRenderTarget;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  runtime.currentScissorRect = saved.currentScissorRect;
  runtime.scissorStack = saved.scissorStack;
  runtime.clipForms = saved.clipForms;
  runtime.currentMaskDepth = saved.currentMaskDepth;
  invalidateGlCubeFaceBindingCache(runtime);
}

export function initializeGlCubeRenderTarget(
  out: EntityConstruction<GlCubeRenderTarget>,
  size: number,
  framebuffer: WebGLFramebuffer,
  texture: WebGLTexture,
  depthStencilRenderbuffer: WebGLRenderbuffer | null,
): void {
  out.colorSpace = 'linear';
  out.depthStencilRenderbuffer = depthStencilRenderbuffer;
  out.framebuffer = framebuffer;
  out.height = size;
  out.size = size;
  out.texture = texture;
  out.textures = [texture];
  out.width = size;
}

function invalidateGlCubeFaceBindingCache(runtime: GlRenderStateRuntime): void {
  runtime.context.currentBlendSignature = null;
  runtime.context.currentShader = null;
  runtime.context.currentTextureRealization = null;
}

function readGlCubeFaceBox(gl: GlRenderState['gl'], parameter: number): [number, number, number, number] {
  const value = gl.getParameter(parameter) as ArrayLike<number> | null;
  if (value === null || value.length < 4) return [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight];
  return [value[0], value[1], value[2], value[3]];
}

function resolveGlCubeFaceClearColor(state: Readonly<GlRenderState>, out: Float32Array): void {
  const color = state.backgroundColorRgba;
  out[0] = color[0] ?? 0;
  out[1] = color[1] ?? 0;
  out[2] = color[2] ?? 0;
  out[3] = color.length >= 4 ? color[3] : 0;
}

function restoreGlCubeFaceCapability(gl: GlRenderState['gl'], capability: number, enabled: boolean): void {
  if (enabled) gl.enable(capability);
  else gl.disable(capability);
}

function targetViewport(size: number): GlViewportRect {
  return { height: size, width: size, x: 0, y: 0 };
}

const clearRgba = new Float32Array(4);
const glCubeFaceStacks = new WeakMap<GlRenderState, SavedGlCubeFaceState[]>();
