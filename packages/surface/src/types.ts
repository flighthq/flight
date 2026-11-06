import type { AppWindow } from '@flighthq/app/contract';
import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

// A host-defined native drawable identity. Web supplies an HTMLCanvasElement, SDL an SDL_Window, EGL an
// EGLSurface, and lower-level hosts may use an integer, so the common contract deliberately does not
// narrow the representation. Mirrors NativeWindowHandle, which carries the same rule one layer up.
export type NativeSurfaceHandle = unknown;

// The contract every per-kind surface satisfies. It carries no public data of its own: the drawable the
// host allocated lives on the runtime, because it is package-private state only the allocating host may
// narrow, and keeping it there is what lets the portable layers name no platform type.
export interface Surface extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

// A backend-neutral surface whose public context is supplied by the capability that acquired it.
// Backend packages specialize both type parameters (`GlContext`/`GlSurface`, for example), so this
// feature-layer contract never imports a renderer while preserving the exact context type for callers.
export interface SurfaceWithContext<Context, Brand extends string> extends Surface {
  readonly __brand: Brand;
  readonly context: Context;
}

// The structural acquire/create/release seam shared by surface factories. A backend capability may add
// operations (GL adds context-loss subscription) and remains assignable here without a feature->backend
// dependency. Options and context stay correlated through inference at the factory call.
export interface HostSurfaceContextCapability<Context, Options> {
  acquire(surface: Readonly<Surface>, options?: Readonly<Options>): Context | null;
  create(
    window: Readonly<AppWindow>,
    width: number,
    height: number,
    options?: Readonly<Options>,
  ): NativeSurfaceHandle | null;
  release(surface: Readonly<Surface>): void;
}

// Package-private machinery for a Surface. `handle` is required rather than a nullable subsystem slot: a
// surface without a drawable is meaningless, so it is set once at construction and lives exactly as long
// as the surface. This is deliberately not a side table — a WeakMap keyed by surface would have no C/C++
// equivalent, would need clearing between tests, and could fall out of sync with the entity it describes.
export interface SurfaceRuntime extends EntityRuntime {
  handle: NativeSurfaceHandle;
}

// A Canvas 2D rendering surface: a host-allocated drawable with an acquired 2D drawing context. Used for
// both presentation (via HostCanvasCapability.create/acquire) and offscreen allocation (via createSurface).
// Backing store dimensions are read live from the drawable rather than mirrored here.
// CanvasRenderingContext2D remains a deliberate host-type residue at this seam.
export interface CanvasSurface extends Surface {
  readonly __brand: 'CanvasSurface';
  readonly context: CanvasRenderingContext2D;
}

// Canvas 2D drawable lifecycle for presentation and offscreen surfaces. Presentation: `create` allocates
// a drawable from a window, `acquire`/`release` bracket context use. Offscreen: `createSurface` allocates
// a headless drawable at device-pixel dimensions, `destroySurface` frees it. ImageResource production from
// a surface goes through the separate host.image seam (HostImageCapability.createImageFromSurface), not
// here. A host that rasterizes 2D through something other than a browser canvas — cairo on an X drawable,
// Direct2D on an HWND — implements the same calls over its own drawable.
export interface HostCanvasCapability {
  acquire(
    surface: Readonly<Surface>,
    options?: Readonly<CanvasRenderingContext2DSettings>,
  ): CanvasRenderingContext2D | null;
  create(
    window: Readonly<AppWindow>,
    width: number,
    height: number,
    options?: Readonly<CanvasRenderingContext2DSettings>,
  ): NativeSurfaceHandle | null;
  createSurface(width: number, height: number): CanvasSurface | null;
  destroySurface(surface: CanvasSurface): void;
  release(surface: Readonly<Surface>): void;
}

/** The complete Canvas capability group. An omitted slot is capability absence. */
export interface HostCanvasCapabilities {
  readonly context?: HostCanvasCapability;
}

// Sets the size a surface is presented at, in logical pixels. Its own slot rather than a member of the
// resize capability because the two are independently absent: an offscreen or headless host resizes its
// backing store and has no presented size at all, and an omitted slot is the honest report there. The
// ratio between this and the backing store is the app's render scale, which equals the device pixel ratio
// only when the app chooses that — supersampling and dynamic resolution scaling both depend on the two
// staying separate. A surface this host did not allocate is a no-op, not an error.
export interface HostSurfaceDisplayCapability {
  setDisplaySize(surface: Readonly<Surface>, width: number, height: number): void;
}

// Resizes a surface's backing store, in device pixels. Distinct from the display size above.
export interface HostSurfaceResizeCapability {
  resize(surface: Readonly<Surface>, width: number, height: number): void;
}

/** The complete surface capability group. An omitted slot is capability absence. */
export interface HostSurfaceCapabilities {
  readonly display?: HostSurfaceDisplayCapability;
  readonly resize?: HostSurfaceResizeCapability;
}

/**
 * The presentation surface's current size, which every WGPU consumer reads once per frame.
 *
 * The values are live, never a snapshot. A provider returns the size the surface has now; a native host
 * may back these members with getters over its own swapchain. Keeping this contract to two readonly
 * members avoids coupling portable rendering code to the DOM.
 */
export interface WgpuPresentationSurface {
  readonly height: number;
  readonly width: number;
}

/** The device, presentation context, and ownership state acquired for a WGPU surface. */
export interface WgpuHostAcquisition extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  /** `flight` identifies handles created for Flight; `caller` identifies exact borrowed handles. */
  readonly ownership: 'caller' | 'flight';
  readonly surface: WgpuPresentationSurface;
}

export interface WgpuHostAcquisitionOptions {
  readonly format?: GPUTextureFormat;
  readonly powerPreference?: GPUPowerPreference;
}

/** A WGPU rendering surface with its host-acquired device and presentation context. */
export interface WgpuSurface extends Surface {
  readonly __brand: 'WgpuSurface';
  readonly acquisition: WgpuHostAcquisition;
}

export interface WgpuSurfaceAttachResult {
  readonly context: GPUCanvasContext;
  readonly surface: WgpuPresentationSurface;
}

export interface WgpuSurfaceAttachment {
  readonly alphaMode: GPUCanvasAlphaMode;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
}

/**
 * Host lifecycle seam for allocating, acquiring, attaching, and releasing WGPU surfaces. It belongs in
 * the surface contract lane because Surface's factories consume it and render-wgpu already depends on
 * Surface; keeping it in a renderer would force an otherwise type-only dependency cycle.
 */
export interface HostWgpuCapability {
  acquire(surface: Readonly<Surface>, options: Readonly<WgpuHostAcquisitionOptions>): Promise<WgpuHostAcquisition>;
  create(window: Readonly<AppWindow>, width: number, height: number): NativeSurfaceHandle | null;
  attachSurface(
    surface: Readonly<Surface>,
    attachment: Readonly<WgpuSurfaceAttachment>,
  ): WgpuSurfaceAttachResult | null;
  isSupported(): boolean;
  release(acquisition: Readonly<WgpuHostAcquisition>): void;
}
