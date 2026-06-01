import type { Video } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { computeVideoLocalBoundsRectangle, createVideo, createVideoData, createVideoRuntime, getVideoRuntime } from './video';

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
