// The image-codec-owned contracts.

// Raw decoded image: straight (non-premultiplied) RGBA8 pixels plus dimensions. The output of an
// ImageDecoder and the input to an ImageEncoder. `data` is row-major, 4 bytes per pixel, width*height*4
// bytes long, matching @flighthq/bitmap. Canvas adapters expose the same storage through a zero-copy
// Uint8ClampedArray view at the ImageData boundary. decodeImagePremultiplied returns the premultiplied
// variant of this same shape.
export interface DecodedImage {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

// Options for an ImageDecoder. premultiplyAlpha requests premultiplied RGBA output: a decoder able to
// premultiply in one pass (e.g. createImageBitmap({ premultiplyAlpha: 'premultiply' })) should do so,
// otherwise the caller premultiplies the straight result. Straight alpha is the default when omitted.
export interface ImageDecodeOptions {
  premultiplyAlpha?: boolean;
}

// Options for an ImageEncoder. quality is the lossy-format quality hint in [0, 1] (JPEG/WebP); lossless
// formats (PNG) ignore it.
export interface ImageEncodeOptions {
  quality?: number;
}

export interface HostImageDecodeFormatCapability {
  decode(bytes: Readonly<Uint8Array>, options?: Readonly<ImageDecodeOptions>): Promise<DecodedImage>;
}

export interface HostImageDecodeCapabilities {
  readonly avif?: HostImageDecodeFormatCapability;
  readonly bmp?: HostImageDecodeFormatCapability;
  readonly gif?: HostImageDecodeFormatCapability;
  readonly jpeg?: HostImageDecodeFormatCapability;
  readonly png?: HostImageDecodeFormatCapability;
  readonly webp?: HostImageDecodeFormatCapability;
}

export interface HostImageEncodeFormatCapability {
  encode(image: Readonly<DecodedImage>, options?: Readonly<ImageEncodeOptions>): Promise<Uint8Array>;
}

export interface HostImageEncodeCapabilities {
  readonly jpeg?: HostImageEncodeFormatCapability;
  readonly png?: HostImageEncodeFormatCapability;
  readonly webp?: HostImageEncodeFormatCapability;
}

// A per-format image decoder: turns encoded bytes (Uint8Array) into raw RGBA pixels. DOM-free by
// contract — the web/canvas implementation is one swappable backend.
export type ImageDecoder = (
  bytes: Readonly<Uint8Array>,
  options?: Readonly<ImageDecodeOptions>,
) => Promise<DecodedImage>;

export type ImageDecodeFallback = (
  bytes: Readonly<Uint8Array>,
  mimeType: string,
  options?: Readonly<ImageDecodeOptions>,
) => Promise<DecodedImage | null>;

// A per-format image encoder: turns raw RGBA pixels back into encoded bytes (Uint8Array). DOM-free by
// contract — the web/canvas implementation is one swappable backend.
export type ImageEncoder = (
  image: Readonly<DecodedImage>,
  options?: Readonly<ImageEncodeOptions>,
) => Promise<Uint8Array>;
