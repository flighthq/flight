import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createAnimationChannel, createAnimationClip } from './animationClip';
import {
  createAnimationRootMotionExtractor,
  extractAnimationRootMotion,
  initializeAnimationRootMotionExtractor,
} from './animationRootMotion';
import { createAnimationTrack } from './animationTrack';

describe('createAnimationRootMotionExtractor', () => {
  it('creates reusable Entity-backed scratch for one explicit channel', () => {
    const channel = createAnimationChannel(createAnimationTrack({ times: [0, 1], values: [2, 6] }), {});
    const clip = createAnimationClip([channel]);
    const extractor = createAnimationRootMotionExtractor(clip, 0);
    expect(EntityRuntimeKey in extractor).toBe(true);
    expect(extractor.clip).toBe(clip);
    expect(extractor.channel).toBe(channel);
    expect(extractor.channelIndex).toBe(0);
    expect(extractor.cycleDelta[0]).toBe(4);
  });

  it('rejects missing channel indices and malformed quaternion channels', () => {
    const clip = createAnimationClip([]);
    expect(() => createAnimationRootMotionExtractor(clip, 0)).toThrow(/does not exist/);
    const malformed = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({ components: 3, quaternion: true, times: [0], values: [0, 0, 1] }),
        {},
      ),
    ]);
    expect(() => createAnimationRootMotionExtractor(malformed, 0)).toThrow(/four components/);
  });
});

describe('extractAnimationRootMotion', () => {
  it('extracts forward, reverse, and multi-loop vector displacement without replacing scratch', () => {
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({
          components: 3,
          times: [0, 1],
          values: [0, 0, 0, 10, 2, -4],
        }),
        {},
      ),
    ]);
    const extractor = createAnimationRootMotionExtractor(clip, 0);
    const fromMotion = extractor.fromMotion;
    const out = new Float32Array(3);

    expect(extractAnimationRootMotion(out, extractor, 0.75, 1.25)).toBe(true);
    expect(Array.from(out)).toEqual([5, 1, -2]);
    expect(extractAnimationRootMotion(out, extractor, 1.25, 0.75)).toBe(true);
    expect(Array.from(out)).toEqual([-5, -1, 2]);
    expect(extractAnimationRootMotion(out, extractor, 0, 2.5)).toBe(true);
    expect(Array.from(out)).toEqual([25, 5, -10]);
    expect(extractor.fromMotion).toBe(fromMotion);
  });

  it('composes quaternion rotation across loop boundaries', () => {
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({
          components: 4,
          quaternion: true,
          times: [0, 1],
          values: [0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2],
        }),
        {},
      ),
    ]);
    const extractor = createAnimationRootMotionExtractor(clip, 0);
    const out = new Float32Array(4);

    extractAnimationRootMotion(out, extractor, 0, 2);
    expect(Math.abs(out[2])).toBeCloseTo(1);
    expect(Math.abs(out[3])).toBeCloseTo(0);
    extractAnimationRootMotion(out, extractor, 1.5, 0.5);
    expect(out[2]).toBeCloseTo(-Math.SQRT1_2);
    expect(out[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it('writes identity for a zero-duration clip and preserves undersized output', () => {
    const clip = createAnimationClip([
      createAnimationChannel(createAnimationTrack({ components: 2, times: [0], values: [4, 8] }), {}),
    ]);
    const extractor = createAnimationRootMotionExtractor(clip, 0);
    const out = [9, 9];
    expect(extractAnimationRootMotion(out, extractor, 0, 3)).toBe(true);
    expect(out).toEqual([0, 0]);
    const short = [7];
    expect(extractAnimationRootMotion(short, extractor, 0, 1)).toBe(false);
    expect(short).toEqual([7]);
  });

  it('rejects non-finite quaternion ranges before mutating output', () => {
    const clip = createAnimationClip([
      createAnimationChannel(
        createAnimationTrack({
          components: 4,
          quaternion: true,
          times: [0, 1],
          values: [0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2],
        }),
        {},
      ),
    ]);
    const extractor = createAnimationRootMotionExtractor(clip, 0);
    const out = new Float32Array([1, 2, 3, 4]);
    expect(() => extractAnimationRootMotion(out, extractor, 0, Infinity)).toThrow(/finite numbers/);
    expect(() => extractAnimationRootMotion(out, extractor, -Infinity, 0)).toThrow(/finite numbers/);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });
});
describe('initializeAnimationRootMotionExtractor', () => {
  it('is the construction initializer of createAnimationRootMotionExtractor', () => {
    expect(typeof initializeAnimationRootMotionExtractor).toBe('function');
  });
});
