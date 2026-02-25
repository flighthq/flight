import type { PartialWithData, Video, VideoData } from '@flighthq/types';

import { createPrimitive } from './internal/createPrimitive';

export function createVideo(obj: PartialWithData<Video> = {}): Video {
  return createPrimitive<Video, VideoData>('video', obj, createVideoData);
}

export function createVideoData(data?: Partial<VideoData>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
  };
}
