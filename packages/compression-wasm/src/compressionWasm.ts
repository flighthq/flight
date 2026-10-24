import type {
  Decompressor,
  HostCompressDeflateCapability,
  HostCompressLzmaCapability,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
} from '@flighthq/types';
import { CompressionFraming } from '@flighthq/types';

import {
  compress_deflate_wasm,
  compress_deflate_zlib_wasm,
  compress_lzma_wasm,
  decompress_deflate_wasm,
  decompress_lzma_wasm,
  initSync,
} from './wasm/compression_wasm.js';
import { compressionWasmBytes } from './wasm/compressionWasmBytes.js';

const FRAMING_CODES: Record<string, number> = { Raw: 0, Rfc1950: 1 };

let initialized = false;

export function compressDeflate(bytes: Readonly<Uint8Array>): Uint8Array {
  initCompressionWasm();
  return compress_deflate_wasm(bytes as Uint8Array);
}

function decode(
  wasm: (compressed: Uint8Array, uncompressedLength: number, framing: number) => Uint8Array | undefined,
  compressed: Readonly<Uint8Array>,
  uncompressedLength: number,
  framing: CompressionFraming,
): Uint8Array | null {
  initCompressionWasm();
  const code = FRAMING_CODES[framing as string];
  if (code === undefined) return null;
  return wasm(compressed as Uint8Array, uncompressedLength, code) ?? null;
}

export function compressDeflateZlib(bytes: Readonly<Uint8Array>): Uint8Array {
  initCompressionWasm();
  return compress_deflate_zlib_wasm(bytes as Uint8Array);
}

export function compressLzma(bytes: Readonly<Uint8Array>): Uint8Array {
  initCompressionWasm();
  return compress_lzma_wasm(bytes as Uint8Array);
}

export const decompressDeflate: Decompressor = (compressed, uncompressedLength, framing) =>
  decode(decompress_deflate_wasm, compressed, uncompressedLength, framing);

export const decompressLzma: Decompressor = (compressed, uncompressedLength, framing) =>
  decode(decompress_lzma_wasm, compressed, uncompressedLength, framing);

export function initCompressionWasm(): void {
  if (initialized) return;
  initSync({ module: compressionWasmBytes });
  initialized = true;
}

export const sdkHostDecompressDeflate: HostDecompressDeflateCapability = { decompress: decompressDeflate };

export const sdkHostDecompressLzma: HostDecompressLzmaCapability = { decompress: decompressLzma };

export const sdkHostCompressDeflate: HostCompressDeflateCapability = {
  compress(bytes: Readonly<Uint8Array>, framing: CompressionFraming): Uint8Array {
    return framing === CompressionFraming.Rfc1950 ? compressDeflateZlib(bytes) : compressDeflate(bytes);
  },
};

export const sdkHostCompressLzma: HostCompressLzmaCapability = {
  compress(bytes: Readonly<Uint8Array>, framing: CompressionFraming): Uint8Array {
    if (framing !== CompressionFraming.Raw) throw new Error('lzma: only Raw framing is supported');
    return compressLzma(bytes);
  },
};
