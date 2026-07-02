import { createEntity } from '@flighthq/entity';
import type { EntityRuntime, WebcamFacingMode, WebcamStream } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export interface WebcamStreamRuntime extends EntityRuntime {
  binding: null;
  // null until the caller attaches a live stream; a freshly-created entity has no MediaStream yet.
  mediaStream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
}

// Allocates a WebcamStream entity with an attached runtime slot holding the MediaStream.
// The fields in data become the entity's public fields; the runtime is initialized with a
// placeholder MediaStream that is replaced immediately by the caller.
export function createWebcamStreamEntity(data: {
  active: boolean;
  deviceId: string;
  facingMode: WebcamFacingMode | null;
  frameRate: number;
  height: number;
  id: string;
  width: number;
}): WebcamStream {
  const stream = createEntity({
    active: data.active,
    deviceId: data.deviceId,
    facingMode: data.facingMode,
    frameRate: data.frameRate,
    height: data.height,
    id: data.id,
    width: data.width,
  });
  // Initialize with null; the caller overwrites rt.mediaStream once a live stream is acquired. Using
  // null (not new MediaStream()) avoids depending on MediaStream in environments that lack it (jsdom
  // without the media API).
  const rt: WebcamStreamRuntime = {
    binding: null,
    mediaStream: null,
    videoElement: null,
  };
  stream[EntityRuntimeKey] = rt;
  return stream;
}

// Returns the WebcamStreamRuntime attached to stream, or null when stream has no runtime.
export function getWebcamStreamRuntime(stream: Readonly<WebcamStream>): WebcamStreamRuntime | null {
  const rt = stream[EntityRuntimeKey];
  if (rt === undefined || rt === null) return null;
  return rt as WebcamStreamRuntime;
}
