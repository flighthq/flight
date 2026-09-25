import { sdkHostCompressDeflate, sdkHostCompressLzma } from '@flighthq/compression';
import { sdkHostDecompressDeflate, sdkHostDecompressLzma } from '@flighthq/compression';
import type { HostCompressCapabilities, HostDecompressCapabilities } from '@flighthq/types/contract';

export const sdkHostCompress = {
  deflate: sdkHostCompressDeflate,
  lzma: sdkHostCompressLzma,
} as const satisfies HostCompressCapabilities;

export const sdkHostDecompress = {
  deflate: sdkHostDecompressDeflate,
  lzma: sdkHostDecompressLzma,
} as const satisfies HostDecompressCapabilities;

export const sdkHost = {
  compress: sdkHostCompress,
  decompress: sdkHostDecompress,
} as const;
