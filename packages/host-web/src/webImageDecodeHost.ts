import type {
  DecodedImage,
  HostImageDecodeCapabilities,
  HostImageDecodeFormatCapability,
  ImageDecodeOptions,
} from '@flighthq/types/contract';

const decodeWithCanvas: HostImageDecodeFormatCapability = {
  async decode(bytes: Readonly<Uint8Array>, options?: Readonly<ImageDecodeOptions>): Promise<DecodedImage> {
    const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const data = context.getImageData(0, 0, width, height).data;
    if (options?.premultiplyAlpha === true) premultiplyRgbaInPlace(data);
    return { data, width, height };
  },
};

function premultiplyRgbaInPlace(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 255) continue;
    data[i] = (data[i] * alpha) / 255;
    data[i + 1] = (data[i + 1] * alpha) / 255;
    data[i + 2] = (data[i + 2] * alpha) / 255;
  }
}

export const webHostImageDecode = {
  avif: decodeWithCanvas,
  bmp: decodeWithCanvas,
  gif: decodeWithCanvas,
  jpeg: decodeWithCanvas,
  png: decodeWithCanvas,
  webp: decodeWithCanvas,
} as const satisfies HostImageDecodeCapabilities;
