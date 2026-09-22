import type { HostCompressCapabilities } from '@flighthq/types/contract';

// Compression is platform-independent pure TypeScript — no Web API to forward to — so the web host
// declares an empty group. A caller supplies sdkHostCompressDeflate from @flighthq/compression.
export const webHostCompress = {} satisfies HostCompressCapabilities;
