export function cloneImageData(source: ImageData): ImageData {
  const img = new ImageData(source.width, source.height);
  img.data.set(source.data);
  return img;
}

export function createImageData(width: number, height: number, color: number = 0): ImageData {
  const img = new ImageData(width, height);
  if (color !== 0) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const a = (color >>> 24) & 0xff;
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  return img;
}
