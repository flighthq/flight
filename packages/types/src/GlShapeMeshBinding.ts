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
