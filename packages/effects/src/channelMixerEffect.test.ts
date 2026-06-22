import { createChannelMixerEffect } from './channelMixerEffect';

describe('createChannelMixerEffect', () => {
  it('tags the intent type', () => {
    expect(createChannelMixerEffect({ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] }).kind).toBe('ChannelMixerEffect');
  });

  it('carries the matrix', () => {
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    expect(createChannelMixerEffect({ matrix }).matrix).toBe(matrix);
  });
});
