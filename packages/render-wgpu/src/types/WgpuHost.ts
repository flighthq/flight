import type { AppWindow } from '@flighthq/app/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type {
  HostWgpuSurfaceCapability,
  NativeSurfaceHandle,
  Surface,
  WgpuPresentationSurface,
} from '@flighthq/surface/contract';

import type { WgpuPowerPreference } from './WgpuAdapter.ts';
import type { WgpuCanvasAlphaMode, WgpuCanvasContext } from './WgpuCanvasContext.ts';
import type { WgpuDevice } from './WgpuDevice.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';

// Surface owns the presentation-size contract, which names no GPU type. This re-export preserves
// render-wgpu's established API.
export type { WgpuPresentationSurface } from '@flighthq/surface/contract';

/**
 * Host lifecycle seam for allocating, acquiring, attaching, and releasing WGPU surfaces. Surface's
 * factories consume its generic acquire/create/release core; render-wgpu owns the concrete shape because
 * the acquisition carries a WgpuDevice, as render-gl owns HostGlCapability for its GlContext.
 */
export interface HostWgpuCapability extends HostWgpuSurfaceCapability<WgpuHostAcquisition, WgpuHostAcquisitionOptions> {
  acquire(surface: Readonly<Surface>, options: Readonly<WgpuHostAcquisitionOptions>): Promise<WgpuHostAcquisition>;
  create(window: Readonly<AppWindow>, width: number, height: number): NativeSurfaceHandle | null;
  attachSurface(
    surface: Readonly<Surface>,
    attachment: Readonly<WgpuSurfaceAttachment>,
  ): WgpuSurfaceAttachResult | null;
  isSupported(): boolean;
  release(acquisition: Readonly<WgpuHostAcquisition>): void;
}

/** The device, presentation context, and ownership state acquired for a WGPU surface. */
export interface WgpuHostAcquisition extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly context: WgpuCanvasContext;
  readonly device: WgpuDevice;
  readonly format: WgpuTextureFormat;
  /** `flight` identifies handles created for Flight; `caller` identifies exact borrowed handles. */
  readonly ownership: 'caller' | 'flight';
  readonly surface: WgpuPresentationSurface;
}

export interface WgpuHostAcquisitionOptions {
  readonly format?: WgpuTextureFormat;
  readonly powerPreference?: WgpuPowerPreference;
}

export interface WgpuSurfaceAttachResult {
  readonly context: WgpuCanvasContext;
  readonly surface: WgpuPresentationSurface;
}

export interface WgpuSurfaceAttachment {
  readonly alphaMode: WgpuCanvasAlphaMode;
  readonly device: WgpuDevice;
  readonly format: WgpuTextureFormat;
}
