import type { Entity } from './Entity';
import type { GlContext, GlContextOptions } from './GlContext';
import type { InputTargetHandle } from './InputTargetBackend';

// Host-emitted file drops are an event capability, separate from target preparation and pointer-lock
// commands even when one platform covers all three. The returned release closes over the exact provider
// resource that created it, so application teardown cannot be redirected by a later Host selection.
export interface HostInputDropFileCapability extends Entity {
  subscribe(target: InputTargetHandle, listener: (path: string) => void): () => void;
}

// Host-emitted target focus is its own event capability. Core owns the ApplicationWindow signals; the
// backend owns only event ingress and its exact release obligation.
export interface HostInputFocusCapability extends Entity {
  subscribe(target: InputTargetHandle, onFocus: () => void, onBlur: () => void): () => void;
}

// Pointer lock is command-only: request is target-scoped while exit is provider-global. Keeping both in
// one slot records their shared coverage without merging either command with an event capability. A
// request outcome is method-tight: only request can report target lookup or denial, while exit can report
// only release availability/failure. A successful request's consumer must retain this backend until exit
// so later Host selection cannot reroute it.
export type InputPointerLockExitOutcome =
  | { readonly reason: 'ok' }
  | { readonly reason: 'api-unavailable' | 'operation-failed' };

export type InputPointerLockRequestOutcome =
  | { readonly reason: 'ok' }
  | { readonly reason: 'api-unavailable' | 'denied' | 'operation-failed' | 'target-not-found' };

export interface HostInputPointerLockCapability extends Entity {
  exit(): Promise<InputPointerLockExitOutcome>;
  request(target: InputTargetHandle): Promise<InputPointerLockRequestOutcome>;
}

// GL context lifecycle for a provider-bound target. `acquire` is the slot's primary purpose — a caller
// that needs a context asks the host for one rather than reaching for a platform API. It returns null
// when the target holds no drawable surface, the sentinel the target-scoped hooks above use for a
// lookup that cannot succeed. `release` drops the host's record for that target; it does not force
// context loss, which the driver owns and `subscribe` reports.
export interface HostGlCapability extends Entity {
  acquire(target: InputTargetHandle, options?: Readonly<GlContextOptions>): GlContext | null;
  release(target: InputTargetHandle): void;
  subscribe(target: InputTargetHandle, onLost: () => void, onRestored: () => void): () => void;
}

export interface HostSurfaceCapability extends Entity {
  resize(target: InputTargetHandle, width: number, height: number): void;
}
