import type { VideoSource } from '@flighthq/types';

export function createVideoSource(element?: HTMLVideoElement): VideoSource {
  return { element: element ?? null };
}
