import { DisplayObjectType, type PartialWithData, type Video, type VideoData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createVideo(obj: PartialWithData<Video> = {}): Video {
  return createPrimitive(DisplayObjectType.Video, obj, createVideoData) as Video;
}

export function createVideoData(data?: Partial<VideoData>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
  };
}
