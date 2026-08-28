export interface GlRenderSurfaceProvider {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement | null;
}
