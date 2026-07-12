import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import type { MethodsOf, Node, PartialNode, Rectangle, Video, VideoData, VideoRuntime } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeVideoLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
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

// The discoverable companion to the direct-mutation path: after mutating `data.source` in place
// (rather than through `setVideoSource`), call this to invalidate. It mirrors what `setVideoSource`
// invalidates — the content revision (new frames) and the local-bounds revision (a differently-sized
// source changes the node's extent) — and never touches the transform. A smoothing-only change is
// content alone; this union covers either direct mutation.
export function invalidateVideo(source: Video): void {
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
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
