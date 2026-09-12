// The one web-only step a WGPU caller needs before anything portable begins: a canvas sized correctly in
// both spaces. CSS size and backing-store size are different numbers on a high-DPI display, and getting
// that pair wrong is the footgun this exists to remove — everything downstream takes the element.
//
// It lives in host-web rather than render-wgpu because a portable render package must name no web type,
// and it is an ordinary function rather than a registered provider because a caller who wants a canvas
// can simply call it.
export function createWebWgpuCanvasElement(width: number, height: number, pixelRatio = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  return canvas;
}
