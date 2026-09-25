import type { DecodedImage } from './DecodedImage.ts';
import type { ImageEncodeOptions } from './ImageEncodeOptions.ts';

export interface HostImageEncodeFormatCapability {
  encode(image: Readonly<DecodedImage>, options?: Readonly<ImageEncodeOptions>): Promise<Uint8Array>;
}

export interface HostImageEncodeCapabilities {
  readonly jpeg?: HostImageEncodeFormatCapability;
  readonly png?: HostImageEncodeFormatCapability;
  readonly webp?: HostImageEncodeFormatCapability;
}
