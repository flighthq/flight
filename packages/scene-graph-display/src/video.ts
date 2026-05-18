import type { PartialNode, Video, VideoData } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createVideo(obj?: Readonly<PartialNode<Video>>): Video {
  return createDisplayObjectGeneric(VideoKind, obj, createVideoData) as Video;
}

export function createVideoData(data?: Readonly<Partial<VideoData>>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
  };
}
