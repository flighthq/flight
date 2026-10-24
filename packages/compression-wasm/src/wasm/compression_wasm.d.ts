/* tslint:disable */
/* eslint-disable */

export function compress_deflate_wasm(bytes: Uint8Array): Uint8Array;

export function compress_deflate_zlib_wasm(bytes: Uint8Array): Uint8Array;

export function compress_lzma_wasm(bytes: Uint8Array): Uint8Array;

export function decompress_deflate_wasm(
  compressed: Uint8Array,
  uncompressed_length: number,
  framing: number,
): Uint8Array | undefined;

export function decompress_lzma_wasm(
  compressed: Uint8Array,
  uncompressed_length: number,
  framing: number,
): Uint8Array | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

export default function __wbg_init(
  module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
