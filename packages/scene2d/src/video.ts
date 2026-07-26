import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node/contract';
import type { MethodsOf, Node, PartialNode, Rectangle, Video, VideoData, VideoRuntime } from '@flighthq/types/contract';
import { VideoKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject';

export function computeVideoLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const element = (source.data as VideoData).source?.element;
  if (element !== undefined && element !== null) {
    out.width = element.videoWidth;
    out.height = element.videoHeight;
  }
}

export function createVideo(obj?: Readonly<PartialNode<Video>>): Video {
  return createNode2D(VideoKind, obj, createVideoData, createVideoRuntime) as Video;
}

export function createVideoData(data?: Readonly<Partial<VideoData>>): VideoData {
  return {
    smoothing: data?.smoothing ?? true,
    source: data?.source ?? null,
  };
}

export function createVideoRuntime(): VideoRuntime {
  return createNode2DRuntime(defaultMethods) as VideoRuntime;
}

export function getVideoRuntime(source: Readonly<Video>): Readonly<VideoRuntime> {
  return getNode2DRuntime(source) as VideoRuntime;
}

export function setVideoSmoothing(source: Video, value: boolean): void {
  // Sampler filter mode is a content-rasterization concern, not a compositing one — same tier as a
  // new image on a Bitmap, and it does not change the node's bounds.
  source.data.smoothing = value;
  invalidateNodeLocalContent(source);
}

export function setVideoSource(source: Video, value: VideoData['source']): void {
  // A new source is new pixels (content) and possibly new dimensions (bounds).
  source.data.source = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<VideoRuntime>> = {
  computeLocalBoundsRectangle: computeVideoLocalBoundsRectangle,
};
