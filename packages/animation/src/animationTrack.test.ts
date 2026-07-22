import {
  AnimationInterpolationCubic,
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  EntityRuntimeKey,
} from '@flighthq/types';

import {
  cloneAnimationTrack,
  createAnimationTrack,
  sampleAnimationTrack,
  trimAnimationTrack,
  validateAnimationTrack,
} from './animationTrack';

describe('cloneAnimationTrack', () => {
  it('deep-copies times and values so the clone shares no buffers', () => {
    const track = createAnimationTrack({ components: 2, times: [0, 1], values: [0, 0, 2, 4] });
    const clone = cloneAnimationTrack(track);
    expect(clone.times).not.toBe(track.times);
    expect(clone.values).not.toBe(track.values);
    expect(Array.from(clone.times)).toEqual([0, 1]);
    expect(Array.from(clone.values)).toEqual([0, 0, 2, 4]);
    (clone.values as number[])[0] = 99;
    expect((track.values as number[])[0]).toBe(0);
    expect(EntityRuntimeKey in clone).toBe(true);
  });

  it('preserves a Float32Array backing', () => {
    const track = createAnimationTrack({ times: new Float32Array([0, 1]), values: new Float32Array([0, 10]) });
    const clone = cloneAnimationTrack(track);
    expect(clone.times).toBeInstanceOf(Float32Array);
    expect(clone.values).toBeInstanceOf(Float32Array);
  });

  it('carries scalar fields and the easing reference', () => {
    const easing = (a: number) => a;
    const track = createAnimationTrack({
      components: 3,
      easing,
      interpolation: AnimationInterpolationStep,
      quaternion: false,
      times: [0],
      values: [0, 0, 0],
    });
    const clone = cloneAnimationTrack(track);
    expect(clone.components).toBe(3);
    expect(clone.interpolation).toBe(AnimationInterpolationStep);
    expect(clone.easing).toBe(easing);
  });
});

describe('createAnimationTrack', () => {
  it('fills defaults (linear, 1 component, non-quaternion, no easing)', () => {
    const track = createAnimationTrack({ times: [0, 1], values: [0, 1] });
    expect(track.interpolation).toBe(AnimationInterpolationLinear);
    expect(track.components).toBe(1);
    expect(track.quaternion).toBe(false);
    expect(track.easing).toBeNull();
    expect(EntityRuntimeKey in track).toBe(true);
  });
});

describe('sampleAnimationTrack', () => {
  it('linearly interpolates a scalar mid-segment', () => {
    const track = createAnimationTrack({ times: [0, 1], values: [0, 10] });
    const out = [0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(5);
  });

  it('locates the correct segment on a multi-key track (binary search parity)', () => {
    // A monotonically increasing ramp: value == time * 10 everywhere, so any sample must land on the
    // right segment for the linear result to match. Exercises the binary search across many segments.
    const track = createAnimationTrack({ times: [0, 1, 2, 3, 4, 5], values: [0, 10, 20, 30, 40, 50] });
    const out = [0];
    for (const t of [0.25, 0.99, 1, 1.5, 2.5, 3.75, 4.999]) {
      sampleAnimationTrack(out, track, t);
      expect(out[0]).toBeCloseTo(t * 10, 6);
    }
  });

  it('clamps before the first and after the last keyframe', () => {
    const track = createAnimationTrack({ times: [1, 2], values: [3, 9] });
    const out = [0];
    sampleAnimationTrack(out, track, -5);
    expect(out[0]).toBe(3);
    sampleAnimationTrack(out, track, 99);
    expect(out[0]).toBe(9);
  });

  it('holds the previous keyframe for step interpolation', () => {
    const track = createAnimationTrack({ interpolation: AnimationInterpolationStep, times: [0, 1], values: [0, 10] });
    const out = [0];
    sampleAnimationTrack(out, track, 0.9);
    expect(out[0]).toBe(0);
  });

  it('interpolates a Vector3 component-wise', () => {
    const track = createAnimationTrack({ components: 3, times: [0, 1], values: [0, 0, 0, 2, 4, 6] });
    const out = [0, 0, 0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out).toEqual([1, 2, 3]);
  });

  it('slerps a quaternion track to the half-angle', () => {
    // identity -> 90deg about +Z; midpoint is 45deg about +Z.
    const s = Math.sin(Math.PI / 4);
    const c = Math.cos(Math.PI / 4);
    const track = createAnimationTrack({
      components: 4,
      quaternion: true,
      times: [0, 1],
      values: [0, 0, 0, 1, 0, 0, s, c],
    });
    const out = [0, 0, 0, 0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out[2]).toBeCloseTo(Math.sin(Math.PI / 8), 5);
    expect(out[3]).toBeCloseTo(Math.cos(Math.PI / 8), 5);
    expect(Math.hypot(out[0], out[1], out[2], out[3])).toBeCloseTo(1, 5);
  });

  it('cubic-splines to the midpoint with zero tangents', () => {
    // Per-keyframe layout [inTangent, value, outTangent]; zero tangents -> smoothstep, 0.5 -> midpoint.
    const track = createAnimationTrack({
      interpolation: AnimationInterpolationCubic,
      times: [0, 1],
      values: [0, 0, 0, 0, 10, 0],
    });
    const out = [0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(5);
  });

  it('applies a non-null easing to the segment alpha', () => {
    const track = createAnimationTrack({ easing: () => 0, times: [0, 1], values: [0, 10] });
    const out = [0];
    sampleAnimationTrack(out, track, 0.75);
    // easing forces alpha to 0 -> first keyframe value regardless of t.
    expect(out[0]).toBe(0);
  });

  it('returns the first value when t is exactly on the first keyframe', () => {
    const track = createAnimationTrack({ times: [2, 5], values: [7, 42] });
    const out = [0];
    sampleAnimationTrack(out, track, 2);
    expect(out[0]).toBe(7);
  });

  it('returns the last value when t is exactly on the last keyframe', () => {
    const track = createAnimationTrack({ times: [2, 5], values: [7, 42] });
    const out = [0];
    sampleAnimationTrack(out, track, 5);
    expect(out[0]).toBe(42);
  });

  it('returns zeros for all components when the track is empty', () => {
    const track = createAnimationTrack({ components: 3, times: [], values: [] });
    const out = [9, 9, 9];
    sampleAnimationTrack(out, track, 0);
    expect(out).toEqual([0, 0, 0]);
  });

  it('returns the only keyframe value for a single-keyframe track', () => {
    const track = createAnimationTrack({ times: [5], values: [99] });
    const out = [0];
    sampleAnimationTrack(out, track, 0);
    expect(out[0]).toBe(99);
    sampleAnimationTrack(out, track, 5);
    expect(out[0]).toBe(99);
    sampleAnimationTrack(out, track, 1000);
    expect(out[0]).toBe(99);
  });
});

describe('trimAnimationTrack', () => {
  it('keeps in-range keyframes and rebases times to start at 0', () => {
    const track = createAnimationTrack({ times: [0, 1, 2, 3, 4], values: [0, 10, 20, 30, 40] });
    const sub = trimAnimationTrack(track, 1, 3);
    expect(EntityRuntimeKey in sub).toBe(true);
    expect(Array.from(sub.times)).toEqual([0, 1, 2]);
    expect(Array.from(sub.values)).toEqual([10, 20, 30]);
  });

  it('deep-copies value blocks for multi-component tracks', () => {
    const track = createAnimationTrack({ components: 2, times: [0, 1, 2], values: [0, 0, 2, 4, 8, 16] });
    const sub = trimAnimationTrack(track, 1, 2);
    expect(Array.from(sub.times)).toEqual([0, 1]);
    expect(Array.from(sub.values)).toEqual([2, 4, 8, 16]);
    expect(sub.values).not.toBe(track.values);
  });

  it('copies the 3x cubic keyframe stride', () => {
    const track = createAnimationTrack({
      interpolation: AnimationInterpolationCubic,
      times: [0, 1, 2],
      values: [0, 0, 0, 1, 10, 1, 2, 20, 2],
    });
    const sub = trimAnimationTrack(track, 1, 2);
    expect(Array.from(sub.times)).toEqual([0, 1]);
    expect(Array.from(sub.values)).toEqual([1, 10, 1, 2, 20, 2]);
  });

  it('returns an empty track when no keyframe falls in range', () => {
    const track = createAnimationTrack({ times: [0, 1, 2], values: [0, 10, 20] });
    const sub = trimAnimationTrack(track, 5, 6);
    expect(sub.times.length).toBe(0);
    expect(sub.values.length).toBe(0);
  });
});

describe('validateAnimationTrack', () => {
  it('returns null for a well-formed track', () => {
    const track = createAnimationTrack({ components: 3, times: [0, 1, 2], values: [0, 0, 0, 1, 1, 1, 2, 2, 2] });
    expect(validateAnimationTrack(track)).toBeNull();
  });

  it('flags non-ascending times with the offending index', () => {
    const track = createAnimationTrack({ times: [0, 2, 1], values: [0, 1, 2] });
    const diagnostics = validateAnimationTrack(track);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics![0].code).toBe('nonAscendingTimes');
    expect(diagnostics![0].index).toBe(2);
  });

  it('flags a values-length mismatch', () => {
    const track = createAnimationTrack({ components: 2, times: [0, 1], values: [0, 0, 2] });
    const diagnostics = validateAnimationTrack(track);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.some((d) => d.code === 'valuesLengthMismatch')).toBe(true);
  });

  it('accounts for the 3x cubic stride in the length check', () => {
    const ok = createAnimationTrack({
      interpolation: AnimationInterpolationCubic,
      times: [0, 1],
      values: [0, 0, 0, 0, 10, 0],
    });
    expect(validateAnimationTrack(ok)).toBeNull();
    const bad = createAnimationTrack({
      interpolation: AnimationInterpolationCubic,
      times: [0, 1],
      values: [0, 0, 0, 0],
    });
    expect(validateAnimationTrack(bad)).not.toBeNull();
  });

  it('does not throw on a duplicate time (reports it instead)', () => {
    const track = createAnimationTrack({ times: [0, 0], values: [0, 1] });
    const diagnostics = validateAnimationTrack(track);
    expect(diagnostics![0].code).toBe('nonAscendingTimes');
  });
});
