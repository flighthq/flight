import type { HostVideoProvider, VideoResource } from '@flighthq/types/contract';
import { createVideoResource } from '@flighthq/video/contract';

export function createWebVideoResourceFromMediaStream(
  hostVideo: Readonly<HostVideoProvider>,
  stream: MediaStream,
): VideoResource | null {
  const element = hostVideo.attachStream?.(stream) ?? null;
  return element === null ? null : createVideoResource(element, undefined, true);
}
