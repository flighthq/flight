import type { WgpuBufferSource, WgpuBuffer } from './WgpuBuffer.ts';
import type { WgpuCommandBuffer } from './WgpuCommandBuffer.ts';
import type { WgpuCopyExternalImageDestInfo, WgpuCopyExternalImageSourceInfo } from './WgpuExternalImageSource.ts';
import type { WgpuExtent3D, WgpuTexelCopyBufferLayout, WgpuTexelCopyTextureInfo } from './WgpuTexture.ts';

export interface WgpuQueue {
  copyExternalImageToTexture(
    source: Readonly<WgpuCopyExternalImageSourceInfo>,
    destination: Readonly<WgpuCopyExternalImageDestInfo>,
    copySize: WgpuExtent3D,
  ): void;
  onSubmittedWorkDone(): Promise<void>;
  submit(commandBuffers: readonly WgpuCommandBuffer[]): void;
  writeBuffer(
    buffer: WgpuBuffer,
    bufferOffset: number,
    data: WgpuBufferSource,
    dataOffset?: number,
    size?: number,
  ): void;
  writeTexture(
    destination: Readonly<WgpuTexelCopyTextureInfo>,
    data: WgpuBufferSource,
    dataLayout: Readonly<WgpuTexelCopyBufferLayout>,
    size: WgpuExtent3D,
  ): void;
}
