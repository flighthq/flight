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

// Sets the size a target is presented at, in logical pixels. Its own slot rather than a member of
// HostTargetResizeCapability because the two are independently absent: an offscreen or headless host
// resizes its backing store and has no presented size at all, and an omitted slot is the honest report
// there. The ratio between this and the backing store is the app's render scale, which equals the
// device pixel ratio only when the app chooses that — supersampling and dynamic resolution scaling both
// depend on the two staying separate. A target this host does not own is a no-op, not an error.
export interface HostTargetDisplayCapability extends Entity {
  setDisplaySize(target: HostTarget, width: number, height: number): void;
}

// Resizes a target's backing store, in device pixels. Distinct from the display/logical size above.
export interface HostTargetResizeCapability extends Entity {
  resize(target: HostTarget, width: number, height: number): void;
}
