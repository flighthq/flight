import type { HostDecompressCapabilities } from '@flighthq/types/contract';

// Web exposes no decompression API this adapter can forward to — DecompressionStream is async while
// every container parser here is synchronous — so the group is empty rather than stubbed. A caller
// supplies sdkHostDecompressDeflate, or a native/wasm slot of its own.
export const webHostDecompress = {} satisfies HostDecompressCapabilities;
