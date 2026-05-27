import type { BlendMode } from './BlendMode';
import type { RenderState } from './RenderState';

export interface WebGLRenderState extends RenderState {
  readonly canvas: HTMLCanvasElement;
  currentBlendMode: BlendMode | null;
  currentProgram: WebGLProgram | null;
  currentTexture: WebGLTexture | null;
  readonly gl: WebGL2RenderingContext;
}
