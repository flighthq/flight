import type { Entity } from './Entity';
import type { InputTargetHandle } from './InputTargetBackend';

// Host-emitted file drops are an event capability, separate from target preparation and pointer-lock
// commands even when one platform covers all three. The returned release closes over the exact provider
// resource that created it, so application teardown cannot be redirected by a later Host selection.
export interface InputDropFileBackend extends Entity {
  subscribe(target: InputTargetHandle, listener: (path: string) => void): () => void;
}

// Host-emitted target focus is its own event capability. Core owns the ApplicationWindow signals; the
// backend owns only event ingress and its exact release obligation.
export interface InputFocusBackend extends Entity {
  subscribe(target: InputTargetHandle, onFocus: () => void, onBlur: () => void): () => void;
}

// Pointer lock is command-only: request is target-scoped while exit is provider-global. Keeping both in
// one slot records their shared coverage without merging either command with an event capability. A
// successful request's consumer must retain this backend until exit so later Host selection cannot reroute it.
export interface InputPointerLockBackend extends Entity {
  exit(): Promise<void>;
  request(target: InputTargetHandle): Promise<void>;
}

// Render-context loss/restoration is emitted by the host surface, so it is a Host event slot under R18.
export interface RenderContextBackend extends Entity {
  subscribe(target: InputTargetHandle, onLost: () => void, onRestored: () => void): () => void;
}

// Backing-store sizing is a command. The core ApplicationWindow.onResize signal remains core-owned; an
// attached render state reacts to it and asks this provider to size its opaque surface target.
export interface RenderSurfaceBackend extends Entity {
  resize(target: InputTargetHandle, width: number, height: number): void;
}
