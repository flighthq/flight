import type { Entity, EntityRuntime } from './Entity';

// A host-defined native drawable identity. Web supplies an HTMLCanvasElement, SDL an SDL_Window, EGL an
// EGLSurface, and lower-level hosts may use an integer, so the common contract deliberately does not
// narrow the representation. Mirrors NativeWindowHandle, which carries the same rule one layer up.
export type NativeSurfaceHandle = unknown;

// The contract every per-kind surface satisfies. It carries no public data of its own: the drawable the
// host allocated lives on the runtime, because it is package-private state only the allocating host may
// narrow, and keeping it there is what lets the portable layers name no platform type.
export interface Surface extends Entity {}

// Package-private machinery for a Surface. `handle` is required rather than a nullable subsystem slot: a
// surface without a drawable is meaningless, so it is set once at construction and lives exactly as long
// as the surface. This is deliberately not a side table — a WeakMap keyed by surface would have no C/C++
// equivalent, would need clearing between tests, and could fall out of sync with the entity it describes.
export interface SurfaceRuntime extends EntityRuntime {
  handle: NativeSurfaceHandle;
}
