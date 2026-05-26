export function drawImageData(dest: HTMLCanvasElement, source: ImageData, x: number, y: number): void {
  dest.getContext('2d')!.putImageData(source, x, y);
}
