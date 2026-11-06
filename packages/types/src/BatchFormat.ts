import type { BatchFormat as RenderBatchFormat } from '@flighthq/render/contract';

/** @deprecated Import render contracts from `@flighthq/render/contract`. */
export type BatchFormat = RenderBatchFormat;

export const BatchFormat = {
  0: 'Quad',
  1: 'VertexStream',
  Quad: 0,
  VertexStream: 1,
} as const;
