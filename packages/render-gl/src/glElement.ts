export function createGlCanvasElement(width: number, height: number, pixelRatio: number = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  return canvas;
}
