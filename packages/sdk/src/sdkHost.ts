import { sdkHostCompressDeflate } from '@flighthq/compression';
import { sdkHostDecompressDeflate } from '@flighthq/compression';
import type { HostCompressCapabilities, HostDecompressCapabilities } from '@flighthq/types/contract';

export const sdkHostCompress = {
  deflate: sdkHostCompressDeflate,
} as const satisfies HostCompressCapabilities;

export const sdkHostDecompress = {
  deflate: sdkHostDecompressDeflate,
} as const satisfies HostDecompressCapabilities;

export const sdkHost = {
  compress: sdkHostCompress,
  decompress: sdkHostDecompress,
} as const;
