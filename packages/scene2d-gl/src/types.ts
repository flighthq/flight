import type {
  GlColorScaleBiasInstancedShader,
  GlParticleShader,
  GlQuadBatchShader,
  GlShapeMeshColorScaleBiasShader,
  GlUniformColorScaleBiasShader,
} from '@flighthq/render-gl/contract';

export interface GlColorAdjustmentResources {
  matrixInstancedShader: GlColorScaleBiasInstancedShader;
  scaleBiasInstancedShader: GlColorScaleBiasInstancedShader;
  tintInstancedShader: GlColorScaleBiasInstancedShader;
  uniformScaleBiasShader: GlUniformColorScaleBiasShader;
}

export interface GlParticleResources {
  cornerBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  shader: GlParticleShader;
}

export interface GlQuadBatchResources {
  cornerBuffer: WebGLBuffer;
  shader: GlQuadBatchShader;
  writerColorScaleBiasBuffer: WebGLBuffer | null;
  writerInstanceBuffer: WebGLBuffer | null;
  writerMaterialBuffer: WebGLBuffer | null;
}

// One tessellated solid-fill region of a Shape, ready for the WebGL flat-color mesh path: interleaved
// xy `vertices`, triangle `indices`, a packed RGBA fill `color`, and the region `alpha`. Produced
// on the CPU (cached by content revision) and drawn crisp at any zoom, the resolution-independent
// alternative to the canvas-raster-to-texture shortcut. Shared across scene2d-gl's base mesh
// path and the opt-in color-adjustment fold, so it lives in the header layer both reach.
export interface GlShapeMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  // Packed RGBA (`0xRRGGBBAA`), carried straight from the shape fill region it was tessellated from.
  color: number;
  alpha: number;
}

// The GL resources for one solid-fill mesh draw: the compiled program, its shared vertex/index buffers,
// and the attribute/uniform locations drawGlShapeMeshBatch drives. The base flat-color program and the
// opt-in color-adjustment fold's tinted program are both expressed as bindings over the one driver.
export interface GlShapeMeshBinding {
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  positionLocation: number;
  matrixLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
}

export interface GlShapeMeshResources {
  binding: GlShapeMeshBinding;
  colorMatrixShader: GlShapeMeshColorScaleBiasShader | null;
  colorScaleBiasShader: GlShapeMeshColorScaleBiasShader | null;
}
