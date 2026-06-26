import { AnimationInterpolationCubic, AnimationInterpolationLinear, AnimationInterpolationStep } from '@flighthq/types';

import { createAnimationTrack, sampleAnimationTrack } from './animationTrack';

describe('createAnimationTrack', () => {
  it('fills defaults (linear, 1 component, non-quaternion, no easing)', () => {
    const track = createAnimationTrack({ times: [0, 1], values: [0, 1] });
    expect(track.interpolation).toBe(AnimationInterpolationLinear);
    expect(track.components).toBe(1);
    expect(track.quaternion).toBe(false);
    expect(track.easing).toBeNull();
  });
});

describe('sampleAnimationTrack', () => {
  it('linearly interpolates a scalar mid-segment', () => {
    const track = createAnimationTrack({ times: [0, 1], values: [0, 10] });
    const out = [0];
    sampleAnimationTrack(out, track, 0.5);
    expect(out[0]).toBeCloseTo(5);
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
