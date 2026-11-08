import type { WgpuDevice } from './WgpuDevice.ts';
import type { WgpuTexture } from './WgpuTexture.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';

export type WgpuCanvasAlphaMode = 'opaque' | 'premultiplied';

export interface WgpuCanvasConfiguration {
  alphaMode?: WgpuCanvasAlphaMode;
  device: WgpuDevice;
  format: WgpuTextureFormat;
  usage?: number;
  viewFormats?: readonly WgpuTextureFormat[];
}

// The presentation context a surface draws into each frame. The browser's GPUCanvasContext satisfies it
// directly; a native host backs it with its swapchain.
export interface WgpuCanvasContext {
  configure(configuration: Readonly<WgpuCanvasConfiguration>): void;
  getCurrentTexture(): WgpuTexture;
  unconfigure(): void;
}
