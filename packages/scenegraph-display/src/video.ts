import type { GraphNode, PartialNode, Rectangle, Video, VideoData, VideoRuntime } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeVideoLocalBoundsRectangle(out: Rectangle, source: Readonly<GraphNode>): void {
  const element = (source.data as VideoData).source?.element;
  if (element !== undefined && element !== null) {
    out.width = element.videoWidth;
    out.height = element.videoHeight;
  }
}

export function createVideo(obj?: Readonly<PartialNode<Video>>): Video {
  return createDisplayObjectGeneric(VideoKind, obj, createVideoData, createVideoRuntime) as Video;
}

export function createVideoData(data?: Readonly<Partial<VideoData>>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
    source: data?.source ?? null,
  };
}

export function createVideoRuntime(): VideoRuntime {
  return createDisplayObjectRuntime(defaultMethods) as VideoRuntime;
}

export function getVideoRuntime(source: Readonly<Video>): Readonly<VideoRuntime> {
  return getDisplayObjectRuntime(source) as VideoRuntime;
}

import type { MethodsOf } from '@flighthq/types';

const defaultMethods: Partial<MethodsOf<VideoRuntime>> = {
  computeLocalBoundsRect: computeVideoLocalBoundsRectangle,
};
