import type { CanvasRenderSurfaceCreator } from '@flighthq/types/contract';

export function createCanvasElement(
  creator: Readonly<CanvasRenderSurfaceCreator>,
  width: number,
  height: number,
  pixelRatio: number = 1,
): HTMLCanvasElement {
  const canvas = creator.createRenderSurface(width, height, pixelRatio);
  if (canvas === null) throw new Error('Failed to create Canvas element.');
  return canvas;
}
