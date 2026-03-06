import { type PartialWithData, type Video, type VideoData,VideoKind } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';

export function createVideo(obj: PartialWithData<Video> = {}): Video {
  return createPrimitive<Video, VideoData>(VideoKind, obj, createVideoData);
}

export function createVideoData(data?: Partial<VideoData>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
  };
}
