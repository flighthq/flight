import type { WgpuCommandBuffer, WgpuCommandBufferDescriptor } from './WgpuCommandBuffer.ts';
import type { WgpuRenderPassDescriptor, WgpuRenderPassEncoder } from './WgpuRenderPassEncoder.ts';
import type { WgpuExtent3D, WgpuTexelCopyBufferInfo, WgpuTexelCopyTextureInfo } from './WgpuTexture.ts';

export interface WgpuCommandEncoder {
  beginRenderPass(descriptor: Readonly<WgpuRenderPassDescriptor>): WgpuRenderPassEncoder;
  copyTextureToBuffer(
    source: Readonly<WgpuTexelCopyTextureInfo>,
    destination: Readonly<WgpuTexelCopyBufferInfo>,
    copySize: WgpuExtent3D,
  ): void;
  finish(descriptor?: Readonly<WgpuCommandBufferDescriptor>): WgpuCommandBuffer;
}

export interface WgpuCommandEncoderDescriptor {
  label?: string;
}
