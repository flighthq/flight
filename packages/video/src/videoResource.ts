import type { VideoResource } from '@flighthq/types';

export function createVideoResource(element?: HTMLVideoElement): VideoResource {
  return { element: element ?? null };
}
