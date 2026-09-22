import type {
  DecodedImage,
  HostImageEncodeCapabilities,
  HostImageEncodeFormatCapability,
  ImageEncodeOptions,
} from '@flighthq/types/contract';

function createCanvasEncoder(mimeType: string): HostImageEncodeFormatCapability {
  return {
    async encode(image: Readonly<DecodedImage>, options?: Readonly<ImageEncodeOptions>): Promise<Uint8Array> {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      const pixels = new Uint8ClampedArray(image.data);
      context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
      const blob = await canvas.convertToBlob({ type: mimeType, quality: options?.quality });
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}

export const webHostImageEncode = {
  jpeg: createCanvasEncoder('image/jpeg'),
  png: createCanvasEncoder('image/png'),
  webp: createCanvasEncoder('image/webp'),
} as const satisfies HostImageEncodeCapabilities;
