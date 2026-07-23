import type { EntityRuntime } from './Entity';

export interface WebcamStreamRuntime extends EntityRuntime {
  binding: null;
  // null until the caller attaches a live stream; a freshly-created entity has no MediaStream yet.
  mediaStream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
}
