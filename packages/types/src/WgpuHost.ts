/**
 * The presentation surface's current size, which every WGPU consumer reads once per frame.
 *
 * **The values are live, never a snapshot.** A provider returns the size the surface has *now* — an
 * `HTMLCanvasElement` satisfies this structurally, because reading `.width` after a resize yields the new
 * value. A provider that captured `{ width, height }` when the surface was acquired would leave every
 * consumer frozen at the size it had at construction, and would still pass any test that never resizes.
 *
 * `readonly` constrains the **consumer** — Flight never writes the size — and says nothing about how the
 * provider stores it. A native host is free to back these with getters over its own swapchain.
 *
 * Deliberately two members and no more: nothing on the WGPU runtime path reads anything else from the
 * surface, and widening it would re-admit the DOM coupling this type exists to remove.
 */
export interface WgpuPresentationSurface {
  readonly height: number;
  readonly width: number;
}

export interface WgpuHostAcquisition extends Entity {
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  /**
   * `flight` identifies handles created for Flight; `caller` identifies exact borrowed handles. The
   * canonical lifecycle and ownership contract is recorded in `agents/backend-lifecycle-ownership.md`.
   */
  readonly ownership: 'caller' | 'flight';
  readonly surface: WgpuPresentationSurface;
}

export interface WgpuHostAcquisitionOptions {
  readonly format?: GPUTextureFormat;
  readonly powerPreference?: GPUPowerPreference;
}

// Process-wide host seam for acquiring a WebGPU device and presentation context. A native host may
// return its own structurally compatible handles without coupling render-wgpu to Application or a
// host runtime. Its canonical lifecycle and ownership contract is recorded in
// agents/backend-lifecycle-ownership.md.
export interface HostWgpuProvider extends Entity {
  acquire(canvas: HTMLCanvasElement, options: Readonly<WgpuHostAcquisitionOptions>): Promise<WgpuHostAcquisition>;
  // Binds a device to a presentation surface and returns its configured swap-chain context, or null when
  // the surface cannot present. Separate from `acquire` because a device outlives any one surface: a
  // second window attaches its own surface to the device already in hand, and only the host knows how a
  // surface yields a context.
  attachSurface(surface: WgpuScreenSurface, attachment: Readonly<WgpuSurfaceAttachment>): GPUCanvasContext | null;
  isSupported(): boolean;
  release(acquisition: Readonly<WgpuHostAcquisition>): void;
}

// Anything that can hand out a WebGPU presentation context and report its own live size: an
// HTMLCanvasElement, an OffscreenCanvas, or a native host's surface object. Typed structurally so the
// render packages name no DOM type and a native host needs no web shim.
export interface WgpuScreenSurface extends WgpuPresentationSurface {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}

export interface WgpuSurfaceAttachment {
  // Alpha compositing of the swap-chain texture against the page.
  readonly alphaMode: GPUCanvasAlphaMode;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
}
import type { Entity } from './Entity';
