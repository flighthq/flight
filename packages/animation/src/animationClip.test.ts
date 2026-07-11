import {
  cloneAnimationClip,
  createAnimationChannel,
  createAnimationClip,
  getAnimationClipDuration,
  sampleAnimationClip,
} from './animationClip';
import { createAnimationTrack } from './animationTrack';

function track(times: number[]) {
  return createAnimationTrack({ times, values: times.map(() => 0) });
}

describe('cloneAnimationClip', () => {
  it('deep-copies each channel track but shares targetRefs by reference', () => {
    const target = {};
    const clip = createAnimationClip([createAnimationChannel(track([0, 1]), target)]);
    const clone = cloneAnimationClip(clip);
    expect(clone).not.toBe(clip);
    expect(clone.channels).not.toBe(clip.channels);
    expect(clone.channels[0].track).not.toBe(clip.channels[0].track);
    expect(clone.channels[0].track.times).not.toBe(clip.channels[0].track.times);
    expect(clone.channels[0].targetRef).toBe(target);
    expect(clone.duration).toBe(clip.duration);
  });
});

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

describe('sampleAnimationClip', () => {
  it('samples every channel at the given time and visits each with its channel and index', () => {
    const a = createAnimationTrack({ times: [0, 1], values: [0, 10] });
    const b = createAnimationTrack({ times: [0, 1], values: [100, 200] });
    const targetA = { id: 'a' };
    const targetB = { id: 'b' };
    const clip = createAnimationClip([createAnimationChannel(a, targetA), createAnimationChannel(b, targetB)]);
    const out = [0];
    const seen: Array<{ index: number; target: unknown; value: number }> = [];
    sampleAnimationClip(out, clip, 0.5, (sampled, channel, index) => {
      seen.push({ index, target: channel.targetRef, value: sampled[0] });
    });
    expect(seen).toEqual([
      { index: 0, target: targetA, value: 5 },
      { index: 1, target: targetB, value: 150 },
    ]);
  });

  it('does not invoke the visitor for a channel-less clip', () => {
    const clip = createAnimationClip([], 1);
    let calls = 0;
    sampleAnimationClip([0], clip, 0, () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});
