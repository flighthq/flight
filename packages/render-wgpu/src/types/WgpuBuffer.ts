export interface WgpuBuffer {
  // Optional because not every implementation reports a map state; an absent state reads as idle.
  readonly mapState?: WgpuBufferMapState;
  readonly size: number;
  readonly usage: number;
  destroy(): void;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  unmap(): void;
}

export interface WgpuBufferDescriptor {
  label?: string;
  mappedAtCreation?: boolean;
  size: number;
  usage: number;
}

export type WgpuBufferMapState = 'mapped' | 'pending' | 'unmapped';

// Bytes a queue write reads from. Plain buffers and views are portable; a native host reads the same
// bytes from linear memory.
export type WgpuBufferSource = ArrayBufferLike | ArrayBufferView<ArrayBufferLike>;

// Usage flags a buffer is created with, combined with `|`. The numeric values are WGPU's own, so a
// descriptor built from these is valid on every backend.
export const WgpuBufferUsage = {
  COPY_DST: 0x0008,
  COPY_SRC: 0x0004,
  INDEX: 0x0010,
  INDIRECT: 0x0100,
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  QUERY_RESOLVE: 0x0200,
  STORAGE: 0x0080,
  UNIFORM: 0x0040,
  VERTEX: 0x0020,
} as const;

export const WgpuMapMode = {
  READ: 0x0001,
  WRITE: 0x0002,
} as const;
