import type { PlatformEndianness } from '@flighthq/platform/contract';

export type WgpuUniformEndiannessStatus = 'unvalidated' | 'validated';

export interface WgpuUniformEndiannessExplanation {
  endianness: PlatformEndianness;
  status: WgpuUniformEndiannessStatus;
}
