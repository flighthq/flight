import type { PartialNode, Video, VideoData, VideoRuntime } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function createVideo(obj?: Readonly<PartialNode<Video>>): Video {
  return createDisplayObjectGeneric(VideoKind, obj, createVideoData, createVideoRuntime) as Video;
}

export function createVideoData(data?: Readonly<Partial<VideoData>>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
  };
}

export function createVideoRuntime(): VideoRuntime {
  return createDisplayObjectRuntime() as VideoRuntime;
}

export function getVideoRuntime(source: Readonly<Video>): Readonly<VideoRuntime> {
  return getDisplayObjectRuntime(source) as VideoRuntime;
}
