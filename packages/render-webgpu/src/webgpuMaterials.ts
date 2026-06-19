import type { BlendMode, WebGPUBitmapShader, WebGPURenderState } from '@flighthq/types';

import { bindWebGPUTexture } from './webgpuDraw';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { getActiveWebGPUPipeline, writeWebGPUQuadUniforms } from './webgpuShader';

// The color transform shader is the same WGSL as the bitmap shader since color transform
// support is built directly into the standard WGSL uniform struct (hasColorTransform flag).
// Registering a color transform "shader" simply sets the useColorTransform flag on nodes
// that have a color transform, which the existing uniform upload already handles.

export function drawWebGPUColorTransformBitmap(
  state: WebGPURenderState,
  renderProxy: {
    alpha: number;
    transform2D: { a: number; b: number; c: number; d: number; tx: number; ty: number };
    blendMode: BlendMode | null;
  },
  imageSource: CanvasImageSource,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const runtime = getWebGPURenderStateRuntime(state);
  const pass = runtime.renderPass;
  if (pass === null) return;

  state.applyBlendMode?.(state, renderProxy.blendMode);
  const textureEntry = bindWebGPUTexture(state, imageSource);
  const uniformOffset = writeWebGPUQuadUniforms(state, renderProxy, null, x0, y0, x1, y1, u0, v0, u1, v1);
  const pipeline = getActiveWebGPUPipeline(state);

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, runtime.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  if (runtime.currentMaskDepth > 0) pass.setStencilReference(runtime.currentMaskDepth);
  pass.draw(6);
}

export function registerWebGPUColorTransformShader(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (runtime.colorTransformBitmapShader !== undefined) return;

  // The color transform shader is the default pipeline — color transform data is
  // already baked into the uniform buffer and handled by the WGSL fragment shader.
  // This function exists for API symmetry with registerWebGLColorTransformShader.
  const shader: WebGPUBitmapShader = {
    pipeline: null as never, // pipeline is resolved dynamically via getActiveWebGPUPipeline
    bind(bindState: WebGPURenderState, renderProxy: { alpha: number }): void {
      // bind() is called by the user when customising draw; for color transform the default
      // pipeline handles everything automatically via the uniform buffer.
      void bindState;
      void renderProxy;
    },
  };

  runtime.colorTransformBitmapShader = shader;
}
