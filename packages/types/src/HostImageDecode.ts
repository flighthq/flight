import type { DecodedImage } from './DecodedImage';
import type { ImageDecodeOptions } from './ImageDecodeOptions';

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
