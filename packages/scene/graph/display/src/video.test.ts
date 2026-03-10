import type { Video } from '@flighthq/types';
import { VideoKind } from '@flighthq/types';

import { createVideo } from './video';

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
