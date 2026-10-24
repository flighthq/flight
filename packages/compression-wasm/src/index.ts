export {
  compressDeflate,
  compressDeflateZlib,
  compressLzma,
  decompressDeflate,
  decompressLzma,
  initCompressionWasm,
  sdkHostCompressDeflate,
  sdkHostCompressLzma,
  sdkHostDecompressDeflate,
  sdkHostDecompressLzma,
} from './compressionWasm.ts';
export * from '@flighthq/compression';
