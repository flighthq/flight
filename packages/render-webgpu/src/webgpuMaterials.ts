import type { BlendMode, WebGPURenderState } from '@flighthq/types';

import type { WebGPUBitmapShader, WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture } from './webgpuDraw';
import { getActiveWebGPUPipeline, writeWebGPUQuadUniforms } from './webgpuShader';

// The color transform shader is the same WGSL as the bitmap shader since color transform
// support is built directly into the standard WGSL uniform struct (hasColorTransform flag).
// Registering a color transform "shader" simply sets the useColorTransform flag on nodes
// that have a color transform, which the existing uniform upload already handles.

export function drawWebGPUColorTransformBitmap(
  state: WebGPURenderStateInternal,
  renderNode: {
    alpha: number;
    useColorTransform: boolean;
    colorTransform: {
      redMultiplier: number;
      greenMultiplier: number;
      blueMultiplier: number;
      alphaMultiplier: number;
      redOffset: number;
      greenOffset: number;
      blueOffset: number;
      alphaOffset: number;
    } | null;
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
  const pass = state.renderPass;
  if (pass === null) return;

  state.applyBlendMode?.(state, renderNode.blendMode);
  const textureEntry = bindWebGPUTexture(state, imageSource);
  const uniformOffset = writeWebGPUQuadUniforms(state, renderNode, x0, y0, x1, y1, u0, v0, u1, v1);
  const pipeline = getActiveWebGPUPipeline(state);

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  if (state.currentMaskDepth > 0) pass.setStencilReference(state.currentMaskDepth);
  pass.draw(6);
}

export function registerWebGPUColorTransformShader(state: WebGPURenderState): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.colorTransformBitmapShader !== undefined) return;

  // The color transform shader is the default pipeline — color transform data is
  // already baked into the uniform buffer and handled by the WGSL fragment shader.
  // This function exists for API symmetry with registerWebGLColorTransformShader.
  const shader: WebGPUBitmapShader = {
    pipeline: null as never, // pipeline is resolved dynamically via getActiveWebGPUPipeline
    bind(
      bindState: WebGPURenderStateInternal,
      renderNode: {
        alpha: number;
        useColorTransform: boolean;
        colorTransform: {
          redMultiplier: number;
          greenMultiplier: number;
          blueMultiplier: number;
          alphaMultiplier: number;
          redOffset: number;
          greenOffset: number;
          blueOffset: number;
          alphaOffset: number;
        } | null;
      },
    ): void {
      // bind() is called by the user when customising draw; for color transform the default
      // pipeline handles everything automatically via the uniform buffer.
      void bindState;
      void renderNode;
    },
  };

  internal.colorTransformBitmapShader = shader;
}
