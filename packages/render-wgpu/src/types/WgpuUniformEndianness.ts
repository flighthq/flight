import type { PlatformEndianness } from '@flighthq/types/contract';

export type WgpuUniformEndiannessStatus = 'unvalidated' | 'validated';

export interface WgpuUniformEndiannessExplanation {
  readonly endianness: PlatformEndianness;
  readonly status: WgpuUniformEndiannessStatus;
}
