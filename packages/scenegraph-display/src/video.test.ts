import type { Video } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { createVideo, createVideoData, createVideoRuntime, getVideoRuntime } from './video';

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
