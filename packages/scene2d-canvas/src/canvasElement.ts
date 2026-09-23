import type { CanvasSurface, HostCanvasCapability } from '@flighthq/types/contract';

// Creates a properly sized offscreen CanvasSurface for presentation. The backing canvas is sized in device
// pixels (width × pixelRatio), and its CSS display size is set to logical pixels. The caller attaches the
// element to the DOM via `surface.context.canvas`.
export function createCanvasElement(
  canvasHost: Readonly<HostCanvasCapability>,
  width: number,
  height: number,
  pixelRatio: number = 1,
): CanvasSurface {
  const surface = canvasHost.createSurface(Math.ceil(width * pixelRatio), Math.ceil(height * pixelRatio));
  if (surface === null) throw new Error('Failed to create Canvas element.');
  const canvas = surface.context.canvas as HTMLCanvasElement;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return surface;
}
