import type { ApplicationWindow } from './ApplicationWindow';
import type { Entity } from './Entity';
import type { GlContext, GlContextOptions } from './GlContext';
import type { NativeSurfaceHandle, Surface } from './Surface';

// GL drawable lifecycle. `create` is the allocating lane: it takes the window because a window is what
// every host needs in order to make a drawable at all — the document on web, the SDL_Window on SDL, the
// EGLNativeWindowType on EGL — and returns the platform drawable, which the surface keeps on its runtime.
// The context options belong to creation rather than to a later attach because EGL chooses its config
// before the window surface exists. Every other operation addresses the Surface itself: null from
// `acquire` means the drawable cannot yield a context, and `release` drops the host's record without
// forcing context loss, which the driver owns and `subscribe` reports.
export interface HostGlCapability extends Entity {
  acquire(surface: Readonly<Surface>, options?: Readonly<GlContextOptions>): GlContext | null;
  create(
    window: Readonly<ApplicationWindow>,
    width: number,
    height: number,
    options?: Readonly<GlContextOptions>,
  ): NativeSurfaceHandle | null;
  release(surface: Readonly<Surface>): void;
  subscribe(surface: Readonly<Surface>, onLost: () => void, onRestored: () => void): () => void;
}
