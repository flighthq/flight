export interface WgpuRenderSurfaceProvider {
  createRenderSurface(width: number, height: number, pixelRatio: number): HTMLCanvasElement | null;
}
