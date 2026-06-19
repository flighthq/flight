import type { BlendMode, Material, RenderProxy2D, WebGLMaterialRenderer, WebGLRenderState } from '@flighthq/types';

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
}

// Per-batch color transform shader for UniformColorTransformMaterial — the base quad-batch layout
// plus color-transform uniforms applied in the fragment shader. Lives with the color transform
// materials, not the base shader, so the default pipeline carries no color-transform record.
export interface WebGLUniformColorTransformShader {
  program: WebGLProgram;
  locCorner: number;
  locWorldMatrix: WebGLUniformLocation;
  locTexture: WebGLUniformLocation;
  locColorMultiplier: WebGLUniformLocation;
  locColorOffset: WebGLUniformLocation;
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
  uniformColorTransformShader?: WebGLUniformColorTransformShader;
  materialRendererMap?: Map<symbol, WebGLMaterialRenderer>;
  // Per-material-kind bitmap shader for the immediate (display-object) path. resolveWebGLShader
  // looks a node's shader up here by its material kind — the render path has no color-transform (or
  // any material-specific) knowledge; the material's shader and its registration own that.
  materialBitmapShaderMap?: Map<symbol, WebGLBitmapShader>;
  // Optional per-node shader-binding resolver. Installed by setWebGLShader; absent (and tree-shaken
  // with the binding map) until a custom shader is bound to a node.
  webglShaderBindingResolver?: (renderProxy: RenderProxy2D) => WebGLBitmapShader | undefined;
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
  // Per-clip unwind stack: the form of each pushed clip (scissor vs stencil contour) so popClip
  // un-installs the right gate.
  clipForms: ('rect' | 'contour')[];
  // Active stencil nesting depth, now driven by contour clips (formerly by masks). The GPU draw path
  // reads this to know when a stencil test is live. Rect clips use the scissor and do not touch it.
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
