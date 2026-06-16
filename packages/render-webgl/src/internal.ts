import type { BlendMode, Material, WebGLMaterialRenderer, WebGLRenderState } from '@flighthq/types';

import type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export type { WebGLBitmapShader, WebGLShaderLocations };

// Per-instance color transform shader: the quad-batch base layout (locations 0-6) plus two
// vec4 instance attributes (a_ctMult at location 7, a_ctOff at location 8) applied per-vertex.
export interface WebGLColorTransformInstancedShader {
  program: WebGLProgram;
  locCorner: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export interface WebGLParticleShader {
  program: WebGLProgram;
  locCorner: number;
  locPos: number;
  locCosScale: number;
  locSinScale: number;
  locColor: number;
  locUVRect: number;
  locSize: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
}

export interface WebGLQuadBatchShader {
  program: WebGLProgram;
  locCorner: number;
  locMatAB: number;
  locMatCD: number;
  locMatTXTY: number;
  locSize: number;
  locUVRect: number;
  locAlpha: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locHasColorTransform: WebGLUniformLocation | null;
  locColorMultiplier: WebGLUniformLocation | null;
  locColorOffset: WebGLUniformLocation | null;
}

export type WebGLRenderStateInternal = Omit<WebGLRenderState, 'canvas' | 'gl'> & {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  colorTransformBitmapShader?: WebGLBitmapShader;
  defaultBitmapShader: WebGLBitmapShader;
  particleShader?: WebGLParticleShader;
  particleCornerBuffer?: WebGLBuffer;
  particleInstanceBuffer?: WebGLBuffer;
  particleInstanceData?: Float32Array;
  quadBatchShader?: WebGLQuadBatchShader;
  quadBatchCornerBuffer?: WebGLBuffer;
  colorTransformInstancedShader?: WebGLColorTransformInstancedShader;
  materialRendererMap?: Map<symbol, WebGLMaterialRenderer>;
  spriteBatchBlendMode: BlendMode | null;
  // The active sprite-batch material (flush key, compared by reference) and its resolved
  // renderer + per-instance float stride. spriteBatchMaterialData/Buffer hold the active
  // material's per-instance attributes, parallel to the base spriteBatchInstanceData.
  spriteBatchMaterial: Material | null;
  spriteBatchMaterialRenderer: WebGLMaterialRenderer | null;
  spriteBatchMaterialFloats: number;
  spriteBatchMaterialData: Float32Array;
  spriteBatchMaterialBuffer: WebGLBuffer | null;
  spriteBatchCount: number;
  spriteBatchInstanceBuffer: WebGLBuffer | null;
  spriteBatchInstanceData: Float32Array;
  spriteBatchTexture: CanvasImageSource | null;
  currentMaskDepth?: number;
  currentScissorRect?: WebGLScissorRect | null;
  /**
   * The framebuffer currently bound for rendering. Null means the default
   * (screen) framebuffer. Maintained internally so begin/end render target
   * can restore the previous binding without a gl.getParameter() call.
   */
  currentFramebuffer: WebGLFramebuffer | null;
  /**
   * When rendering into a WebGLRenderTarget, overrides the canvas dimensions
   * used for clip-space projection and scissor rect computation. Null means
   * use canvas.width / canvas.height (normal on-screen rendering).
   */
  renderTargetViewport: { width: number; height: number } | null;
  shaderLoc: WebGLShaderLocations;
  textureCache: WeakMap<CanvasImageSource, WebGLTexture>;
  quadVertexBuffer: WebGLBuffer;
  quadIndexBuffer: WebGLBuffer;
  quadVertexData: Float32Array;
  matrixArray: Float32Array;
  scissorStack?: WebGLScissorRect[];
};

export interface WebGLScissorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}
