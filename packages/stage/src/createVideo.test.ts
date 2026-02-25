import type { Video } from '@flighthq/types';

import { createVideo } from './createVideo';

describe('createVideo', () => {
  let video: Video;

  beforeEach(() => {
    video = createVideo();
  });

  it('initializes default values', () => {
    expect(video.data.smoothing).toBe(true);
    expect(video.type).toBe('video');
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
});
