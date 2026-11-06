import { createVideoResource } from '@flighthq/video/contract';
import type { HostVideoCapability, VideoResource } from '@flighthq/video/contract';

export function createWebVideoResourceFromMediaStream(
  hostVideo: Readonly<HostVideoCapability>,
  stream: MediaStream,
): VideoResource | null {
  const element = hostVideo.attachStream?.(stream) ?? null;
  return element === null ? null : createVideoResource(element, undefined, true);
}
