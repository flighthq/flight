import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { copyMatrix, createMatrix } from '@flighthq/geometry/contract';
import type {
  Matrix,
  RenderTargetClear,
  WgpuRenderPass,
  WgpuRenderPassViewport,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuSavedPassState,
  WgpuScreenRenderTarget,
  WgpuTextureRenderTarget,
} from '@flighthq/types/contract';

import { beginWgpuFrame, submitWgpuFrame } from './wgpuFrame';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { getWgpuRenderTargetSupersampleScale } from './wgpuRenderTarget';
import { bindWgpuScreenRenderTarget, isWgpuScreenRenderTarget } from './wgpuScreenRenderTarget';

// Opens a render pass into `target` and returns the handle to draw through. Aspects named in `clear` are
// overwritten with the given values; omitted aspects are preserved (loadOp 'load'). Color values are
// linear float RGBA, in the space the target holds.
//
// The pass — not the state — is what a draw entry point takes, because "which target is being drawn
// into" is a property of the pass and of nothing else:
//
//   const pass = beginWgpuRenderPass(state, screen, { color: [0.1, 0.1, 0.18, 1.0], depth: 1.0 });
//   renderWgpuScene2D(pass, root);
//   endWgpuRenderPass(pass);
//
// Passes nest across targets: an offscreen pass opened inside a screen pass suspends it, and ending the
// inner one resumes the outer with loadOp 'load'. A pass carries no 2D transform — a 2D pass that needs a
// specific root device transform calls setWgpuRenderTransform2D after begin, and the bracket restores it.
//
// The handle is pooled: begin claims one, end returns it. Using a handle after its end is a bug, the same
// contract as every other acquire/release bracket.
export function beginWgpuRenderPass(
  state: WgpuRenderState,
  target: WgpuRenderTarget,
  clear?: Readonly<RenderTargetClear>,
): WgpuRenderPass {
  const runtime = getWgpuRenderStateRuntime(state);

  // A WebGPU pass encoder cannot be suspended, only ended; the enclosing pass is re-recorded from its
  // saved attachments when this one ends. The live encoder is read from the runtime rather than from the
  // enclosing handle, because a frame borrower shares the owner's encoder before it shares its stack.
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }
  const enclosing = runtime.passStack.at(-1);
  if (enclosing !== undefined) enclosing.encoder = null;

  const ownsFrame = runtime.commandEncoder === null;
  beginWgpuFrame(state);

  const saved: WgpuSavedPassState = {
    clipForms: runtime.clipForms,
    colorFormat: runtime.currentColorFormat,
    currentMaskDepth: runtime.currentMaskDepth,
    currentScissorRect: runtime.currentScissorRect,
    maskWriteMode: runtime.maskWriteMode,
    renderTarget: runtime.currentRenderTarget,
    renderTargetViewport: runtime.renderTargetViewport,
    renderTransform2D: state.renderTransform2D,
    scissorStack: runtime.scissorStack,
  };

  const colorView = bindWgpuRenderPassTarget(state, target);
  const pass = acquireWgpuRenderPassHandle(state, target, colorView, saved, ownsFrame);
  const scale = getWgpuRenderTargetSupersampleScale(target);
  pass.viewport = { height: target.height / scale, width: target.width / scale };

  runtime.passStack.push(pass);
  runtime.currentRenderTarget = target;
  runtime.currentColorFormat = target.format;
  runtime.renderTargetViewport = pass.viewport;
  // A pass owns its logical clip unwind state. Inheriting the enclosing entries would let a nested pass
  // pop clips it never pushed, desynchronizing the logical and hardware stacks once the outer resumes.
  runtime.clipForms = [];
  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.currentScissorRect = null;
  runtime.scissorStack = [];

  pass.encoder = recordWgpuRenderPassEncoder(state, target, colorView, clear);
  runtime.renderPass = pass.encoder;
  return pass;
}

// Ends the pass: closes its encoder, restores the enclosing pass state, and resumes the enclosing pass
// (re-recorded with loadOp 'load') if there is one. When this pass opened the frame, its end also submits
// it — a caller that opened the frame itself with beginWgpuFrame submits it itself, which is how a
// multi-pass recipe still costs one submit. Ending a pass twice, or out of order, throws: an unbalanced
// bracket is a programmer error, and accepting it silently hides a leaked pass.
export function endWgpuRenderPass(pass: WgpuRenderPass): void {
  const state = pass.state;
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.passStack.at(-1) !== pass) {
    throw new Error('endWgpuRenderPass: this pass is not the innermost open pass');
  }
  runtime.passStack.pop();

  if (pass.encoder !== null) {
    pass.encoder.end();
    pass.encoder = null;
  }
  runtime.renderPass = null;

  const saved = pass.saved;
  runtime.currentRenderTarget = saved.renderTarget;
  runtime.currentColorFormat = saved.colorFormat;
  runtime.renderTargetViewport = saved.renderTargetViewport;
  runtime.clipForms = saved.clipForms;
  runtime.currentMaskDepth = saved.currentMaskDepth;
  runtime.maskWriteMode = saved.maskWriteMode;
  runtime.currentScissorRect = saved.currentScissorRect;
  runtime.scissorStack = saved.scissorStack;
  state.renderTransform2D = saved.renderTransform2D;

  const enclosing = runtime.passStack.at(-1);
  if (enclosing !== undefined) resumeWgpuRenderPass(enclosing);

  const ownsFrame = pass.ownsFrame;
  releaseWgpuRenderPassHandle(pass);
  if (ownsFrame) submitWgpuFrame(state);
}

// The pass a draw entered through, when a caller holds the state rather than the handle: a registered
// renderer is dispatched with the state, and the active pass is what tells it where its draw lands.
// Null outside any pass.
export function getWgpuActiveRenderPass(state: WgpuRenderState): WgpuRenderPass | null {
  return getWgpuRenderStateRuntime(state).passStack.at(-1) ?? null;
}

// The logical extent of the innermost open pass — the space 2D transforms, projections, and scissor
// rectangles are expressed in, whether the pass is supersampled or not. Throws outside a pass: a draw
// with no target bound is API misuse, and inventing a canvas-sized default hides it until the picture
// comes out the wrong size.
export function getWgpuRenderPassViewport(state: WgpuRenderState): Readonly<WgpuRenderPassViewport> {
  const viewport = getWgpuRenderStateRuntime(state).renderTargetViewport;
  if (viewport === null) throw new Error('No Wgpu render pass is open — call beginWgpuRenderPass first');
  return viewport;
}

// Re-records the pass's GPU encoder over the same attachments with loadOp 'load', after a suspend or an
// inner pass. Pixels already drawn are preserved; a suspended pass is resumed exactly once.
export function resumeWgpuRenderPass(pass: WgpuRenderPass): void {
  const runtime = getWgpuRenderStateRuntime(pass.state);
  pass.colorView = bindWgpuRenderPassTarget(pass.state, pass.target);
  pass.encoder = recordWgpuRenderPassEncoder(pass.state, pass.target, pass.colorView, undefined);
  runtime.renderPass = pass.encoder;
}

// Sets the 2D root device transform the display-object update pass reads to place nodes with no scene
// parent. Call after beginWgpuRenderPass when a 2D pass renders into a target with its own coordinate
// system (the render cache); the matching endWgpuRenderPass restores the previous value. A fresh matrix
// is allocated rather than mutated in place, because the bracket saved the previous reference.
export function setWgpuRenderTransform2D(pass: WgpuRenderPass, transform: Readonly<Matrix>): void {
  const next = createMatrix();
  copyMatrix(next, transform);
  pass.state.renderTransform2D = next;
}

// Ends the pass's GPU encoder while leaving the pass open, so a caller can record its own render passes
// into the same frame (the effect pipeline's fullscreen passes). Pair with resumeWgpuRenderPass.
export function suspendWgpuRenderPass(pass: WgpuRenderPass): void {
  if (pass.encoder === null) return;
  pass.encoder.end();
  pass.encoder = null;
  getWgpuRenderStateRuntime(pass.state).renderPass = null;
}

function acquireWgpuRenderPassHandle(
  state: WgpuRenderState,
  target: WgpuRenderTarget,
  colorView: GPUTextureView,
  saved: WgpuSavedPassState,
  ownsFrame: boolean,
): WgpuRenderPass {
  const pooled = _passPool.pop();
  if (pooled !== undefined) {
    pooled.colorView = colorView;
    pooled.encoder = null;
    pooled.ownsFrame = ownsFrame;
    pooled.saved = saved;
    pooled.state = state;
    pooled.target = target;
    return pooled;
  }
  const out = allocateEntity<WgpuRenderPass>();
  out.colorView = colorView;
  out.encoder = null;
  out.ownsFrame = ownsFrame;
  out.saved = saved;
  out.state = state;
  out.target = target;
  out.viewport = { height: 0, width: 0 };
  return finishEntity(out);
}

// Resolves the color view to attach: the swap-chain (or supersample) view for a screen target, the
// target's own view for a texture target. Screen storage is sized to its surface here, which is why a
// caller never announces a canvas resize.
function bindWgpuRenderPassTarget(state: WgpuRenderState, target: WgpuRenderTarget): GPUTextureView {
  if (isWgpuScreenRenderTarget(target)) {
    const view = bindWgpuScreenRenderTarget(state, target);
    getWgpuRenderStateRuntime(state).frameScreenTarget = target as WgpuScreenRenderTarget;
    return view;
  }
  return (target as WgpuTextureRenderTarget).view;
}

function recordWgpuRenderPassEncoder(
  state: WgpuRenderState,
  target: Readonly<WgpuRenderTarget>,
  colorView: GPUTextureView,
  clear: Readonly<RenderTargetClear> | undefined,
): GPURenderPassEncoder {
  const runtime = getWgpuRenderStateRuntime(state);
  const hasColor = clear !== undefined && (clear.color !== undefined || clear.colors !== undefined);
  const encoder = runtime.commandEncoder!.beginRenderPass({
    colorAttachments: [
      {
        view: colorView,
        clearValue: resolveWgpuClearColor(clear),
        loadOp: hasColor ? 'clear' : 'load',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: target.depthStencilView,
      depthClearValue: clear?.depth ?? 1.0,
      depthLoadOp: clear?.depth !== undefined ? 'clear' : 'load',
      depthStoreOp: 'discard',
      stencilClearValue: clear?.stencil ?? 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'discard',
    },
  });
  encoder.setViewport(0, 0, target.width, target.height, 0, 1);
  return encoder;
}

// A released handle keeps its state/target references until the next acquire overwrites them: they are
// plain references to objects the caller still owns, and nulling them would cost the non-null field types
// that make a live handle safe to read.
function releaseWgpuRenderPassHandle(pass: WgpuRenderPass): void {
  pass.encoder = null;
  _passPool.push(pass);
}

// One color value broadcasts to every attachment; `colors` selects per attachment. WebGPU takes the
// clear through the attachment's load operation, so only attachment 0 is expressible today — the
// broadcast and the first per-attachment entry resolve to the same thing here.
function resolveWgpuClearColor(clear: Readonly<RenderTargetClear> | undefined): GPUColor {
  const rgba = clear?.colors?.[0] ?? clear?.color;
  if (rgba === undefined) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] };
}

// Pass handles are per-frame scaffolding, so a render loop must not allocate one per frame. The pool is
// module-scoped rather than per-state: a handle carries no device resource, only references cleared on
// release, so two states on one thread can share the free list.
const _passPool: WgpuRenderPass[] = [];
