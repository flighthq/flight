// Opaque: produced by a command encoder and handed to the queue, never inspected. On web it is the
// browser's GPUCommandBuffer; a native host supplies its own handle.
export type WgpuCommandBuffer = GPUCommandBuffer;

export interface WgpuCommandBufferDescriptor {
  label?: string;
}
