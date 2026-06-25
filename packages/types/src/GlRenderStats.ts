export interface GlRenderStats {
  drawCalls: number;
  triangles: number;
  textureBinds: number;
  programSwitches: number;
  framebufferBinds: number;
  uniformUploads: number;
}
