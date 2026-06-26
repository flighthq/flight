import { createAnimationChannel, createAnimationClip, getAnimationClipDuration } from './animationClip';
import { createAnimationTrack } from './animationTrack';

function track(times: number[]) {
  return createAnimationTrack({ times, values: times.map(() => 0) });
}

describe('createAnimationChannel', () => {
  it('pairs a track with an opaque target ref', () => {
    const t = track([0, 1]);
    const target = {};
    const channel = createAnimationChannel(t, target);
    expect(channel.track).toBe(t);
    expect(channel.targetRef).toBe(target);
  });
});

describe('createAnimationClip', () => {
  it('derives duration from the latest keyframe across channels', () => {
    const clip = createAnimationClip([
      createAnimationChannel(track([0, 1]), null),
      createAnimationChannel(track([0, 2.5]), null),
    ]);
    expect(clip.duration).toBe(2.5);
  });

  it('honors an explicit duration override', () => {
    const clip = createAnimationClip([createAnimationChannel(track([0, 1]), null)], 10);
    expect(clip.duration).toBe(10);
  });
});

describe('getAnimationClipDuration', () => {
  it('returns the clip duration', () => {
    const clip = createAnimationClip([], 4);
    expect(getAnimationClipDuration(clip)).toBe(4);
  });
});
