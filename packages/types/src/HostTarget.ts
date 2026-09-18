import type { Entity } from './Entity';

// Provider-bound identity for a drawable region of the host: a native child window or view, or a web
// element. Opaque by construction — the host that produced it is the only code that can resolve it back
// to a platform object, so neutral application and native-host contracts never name DOM. Input, resize,
// and presentation are all addressed to a target rather than to a surface, because they apply before and
// independently of which graphics API draws there.
export interface HostTarget extends Entity {
  readonly __brand: 'HostTarget';
}

// The contract every per-kind surface satisfies: a drawable bound to the target it draws into. This is the
// whole of what GlSurface, CanvasSurface, and WgpuSurface have in common — each adds its own API's context
// and nothing else — and it is what presentation and input helpers accept so they need not name a backend.
export interface Surface extends Entity {
  readonly target: HostTarget;
}

// One-time host preparation of a target for direct application input: suppressing platform gestures,
// selection, and tap highlighting. Separate from the event capabilities because a host may need the
// preparation without emitting any of those events itself.
export interface HostTargetCapability extends Entity {
  prepare(target: HostTarget): void;
}

// Resizes a target's backing store, in device pixels. Distinct from any display/logical size, which is a
// property of how the target is presented and is owned by the presenting host.
export interface HostTargetResizeCapability extends Entity {
  resize(target: HostTarget, width: number, height: number): void;
}
