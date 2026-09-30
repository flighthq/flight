import type { PlatformEndianness } from './Platform.ts';

export type WgpuUniformEndiannessStatus = 'unvalidated' | 'validated';

export interface WgpuUniformEndiannessExplanation {
  readonly endianness: PlatformEndianness;
  readonly status: WgpuUniformEndiannessStatus;
}
