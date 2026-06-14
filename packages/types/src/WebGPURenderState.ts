import type { BlendMode } from './BlendMode';
import type { RenderState } from './RenderState';

export interface WebGPURenderState extends RenderState {
  applyBlendMode: ((state: WebGPURenderState, blendMode: BlendMode | null) => void) | null;
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  currentBlendMode: BlendMode | null;
}
