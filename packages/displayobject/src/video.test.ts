import { getNodeLocalBoundsRevision, getNodeLocalContentRevision, getNodeLocalTransformRevision } from '@flighthq/node';
import type { Video } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import {
  computeVideoLocalBoundsRectangle,
  createVideo,
  createVideoData,
  createVideoRuntime,
  getVideoRuntime,
  invalidateVideo,
  setVideoSmoothing,
  setVideoSource,
} from './video';

describe('computeVideoLocalBoundsRectangle', () => {
  it('does not modify out when source element is null', () => {
    const video = createVideo();
    const out = { x: 0, y: 0, width: 0, height: 0 };
    computeVideoLocalBoundsRectangle(out as never, video as never);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('sets out dimensions from the video element', () => {
    const video = createVideo();
    const el = document.createElement('video');
    Object.defineProperty(el, 'videoWidth', { get: () => 320 });
    Object.defineProperty(el, 'videoHeight', { get: () => 240 });
    video.data.source = { element: el } as never;
    const out = { x: 0, y: 0, width: 0, height: 0 };
    computeVideoLocalBoundsRectangle(out as never, video as never);
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
  });
});

describe('createVideo', () => {
  let video: Video;

  beforeEach(() => {
    video = createVideo();
  });

  it('initializes default values', () => {
    expect(video.data.smoothing).toBe(true);
    expect(video.kind).toStrictEqual(VideoKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        smoothing: false,
      },
    };
    const obj = createVideo(base);
    expect(obj.data.smoothing).toStrictEqual(base.data.smoothing);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createVideo(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createVideoData', () => {
  it('returns default values', () => {
    const data = createVideoData();
    expect(data.smoothing).toBe(true);
  });

  it('allows pre-defined values', () => {
    const data = createVideoData({ smoothing: false });
    expect(data.smoothing).toBe(false);
  });
});

describe('createVideoRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createVideoRuntime();
    expect(runtime).not.toBeNull();
  });
});

describe('getVideoRuntime', () => {
  it('returns the runtime for a Video', () => {
    const video = createVideo();
    const runtime = getVideoRuntime(video);
    expect(runtime).not.toBeNull();
  });
});

describe('invalidateVideo', () => {
  it('bumps content and local bounds without touching the transform', () => {
    const video = createVideo();
    const content = getNodeLocalContentRevision(video);
    const bounds = getNodeLocalBoundsRevision(video);
    const transform = getNodeLocalTransformRevision(video);
    invalidateVideo(video);
    expect(getNodeLocalContentRevision(video)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(video)).toBe(bounds + 1);
    expect(getNodeLocalTransformRevision(video)).toBe(transform);
  });
});

describe('setVideoSmoothing', () => {
  it('updates the smoothing field', () => {
    const video = createVideo();
    setVideoSmoothing(video, false);
    expect(video.data.smoothing).toBe(false);
    setVideoSmoothing(video, true);
    expect(video.data.smoothing).toBe(true);
  });
});

describe('setVideoSource', () => {
  it('updates the source field', () => {
    const video = createVideo();
    const el = document.createElement('video');
    const source = { element: el } as never;
    setVideoSource(video, source);
    expect(video.data.source).toBe(source);
    setVideoSource(video, null);
    expect(video.data.source).toBeNull();
  });
});
