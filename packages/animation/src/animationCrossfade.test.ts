import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createAnimationChannel, createAnimationClip } from './animationClip';
import {
  advanceAnimationCrossfade,
  createAnimationCrossfade,
  initializeAnimationCrossfade,
  isAnimationCrossfadeComplete,
  sampleAnimationCrossfade,
} from './animationCrossfade';
import { createAnimationPlayer } from './animationPlayer';
import { createAnimationTrack } from './animationTrack';

function player(targetRef: unknown, values: number[], opts?: Readonly<{ components?: number; quaternion?: boolean }>) {
  const track = createAnimationTrack({
    components: opts?.components,
    quaternion: opts?.quaternion,
    times: [0, 1],
    values,
  });
  return createAnimationPlayer(createAnimationClip([createAnimationChannel(track, targetRef)]));
}

describe('advanceAnimationCrossfade', () => {
  it('advances both players by the same delta and updates linear weight', () => {
    const target = {};
    const from = player(target, [0, 10]);
    const to = player(target, [20, 30]);
    const state = createAnimationCrossfade(from, to, 2);
    advanceAnimationCrossfade(state, 0.5);
    expect(from.time).toBe(0.5);
    expect(to.time).toBe(0.5);
    expect(state.elapsed).toBe(0.5);
    expect(state.weight).toBe(0.25);
  });

  it('applies a caller-provided curve to clamped normalized time', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 1]), player(target, [1, 2]), 1, {
      curve: (t) => t * t,
    });
    advanceAnimationCrossfade(state, 0.5);
    expect(state.weight).toBe(0.25);
    advanceAnimationCrossfade(state, 2);
    expect(state.weight).toBe(1);
  });
});

describe('createAnimationCrossfade', () => {
  it('creates an Entity with linear weight and reusable scratch by default', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 1]), player(target, [1, 2]), 2);
    expect(EntityRuntimeKey in state).toBe(true);
    expect(state.elapsed).toBe(0);
    expect(state.weight).toBe(0);
    expect(state.fromSample).toBeInstanceOf(Float32Array);
    expect(state.toSample).toBeInstanceOf(Float32Array);
  });

  it('completes a zero-duration transition immediately', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 1]), player(target, [1, 2]), 0);
    expect(state.weight).toBe(1);
    expect(isAnimationCrossfadeComplete(state)).toBe(true);
  });

  it('matches reordered channels by target and retains one-sided channels', () => {
    const shared = {};
    const fromOnly = {};
    const toOnly = {};
    const from = createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ times: [0], values: [1] }), shared),
        createAnimationChannel(createAnimationTrack({ times: [0], values: [2] }), fromOnly),
      ]),
    );
    const to = createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ times: [0], values: [3] }), toOnly),
        createAnimationChannel(createAnimationTrack({ times: [0], values: [4] }), shared),
      ]),
    );
    const state = createAnimationCrossfade(from, to, 1);
    expect(state.channels).toEqual([
      { channel: to.clip.channels[1], fromIndex: 0, toIndex: 1 },
      { channel: from.clip.channels[1], fromIndex: 1, toIndex: null },
      { channel: to.clip.channels[0], fromIndex: null, toIndex: 0 },
    ]);
  });

  it('rejects incompatible tracks that claim the same target', () => {
    const target = {};
    const scalar = player(target, [0, 1]);
    const vector = player(target, [0, 0, 1, 1], { components: 2 });
    expect(() => createAnimationCrossfade(scalar, vector, 1)).toThrow(/different component widths/);

    const quaternion = player(target, [0, 0, 0, 1, 0, 0, 0, 1], {
      components: 4,
      quaternion: true,
    });
    const vector4 = player(target, [0, 0, 0, 1, 0, 0, 0, 1], { components: 4 });
    expect(() => createAnimationCrossfade(quaternion, vector4, 1)).toThrow(/incompatible quaternion flags/);
  });

  it('rejects duplicate target references in either clip', () => {
    const duplicate = {};
    const unique = {};
    const track = createAnimationTrack({ times: [0], values: [1] });
    const duplicateClip = createAnimationClip([
      createAnimationChannel(track, duplicate),
      createAnimationChannel(track, duplicate),
    ]);
    const uniqueClip = createAnimationClip([
      createAnimationChannel(track, duplicate),
      createAnimationChannel(track, unique),
    ]);
    expect(() =>
      createAnimationCrossfade(createAnimationPlayer(duplicateClip), createAnimationPlayer(uniqueClip), 1),
    ).toThrow(/source clip contains a duplicate targetRef/);
    expect(() =>
      createAnimationCrossfade(createAnimationPlayer(uniqueClip), createAnimationPlayer(duplicateClip), 1),
    ).toThrow(/destination clip contains a duplicate targetRef/);
  });
});

describe('initializeAnimationCrossfade', () => {
  it('is the construction initializer of createAnimationCrossfade', () => {
    expect(typeof initializeAnimationCrossfade).toBe('function');
  });
});

describe('isAnimationCrossfadeComplete', () => {
  it('uses elapsed duration as the retirement condition', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 1]), player(target, [1, 2]), 2);
    expect(isAnimationCrossfadeComplete(state)).toBe(false);
    advanceAnimationCrossfade(state, 2);
    expect(isAnimationCrossfadeComplete(state)).toBe(true);
  });

  it('does not retire early when an easing curve overshoots 1', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 1]), player(target, [1, 2]), 1, {
      curve: (t) => 1 + t,
    });
    advanceAnimationCrossfade(state, 0.7);
    expect(state.weight).toBeGreaterThan(1);
    expect(isAnimationCrossfadeComplete(state)).toBe(false);
    advanceAnimationCrossfade(state, 0.31);
    expect(isAnimationCrossfadeComplete(state)).toBe(true);
  });
});
describe('sampleAnimationCrossfade', () => {
  it('samples both playheads and blends through a distinct output buffer', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 10]), player(target, [20, 40]), 2);
    advanceAnimationCrossfade(state, 0.5);
    const out = [0];
    const seen: number[] = [];
    sampleAnimationCrossfade(out, state, (sampled) => seen.push(sampled[0]));
    expect(seen).toEqual([11.25]);
  });

  it('supports output aliasing either internal blend input', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 10]), player(target, [20, 40]), 2);
    advanceAnimationCrossfade(state, 0.5);
    const seen: number[] = [];
    sampleAnimationCrossfade(state.fromSample, state, (sampled) => seen.push(sampled[0]));
    expect(seen).toEqual([11.25]);
    sampleAnimationCrossfade(state.toSample, state, (sampled) => seen.push(sampled[0]));
    expect(seen).toEqual([11.25, 11.25]);
  });

  it('visits matched and one-sided channels in stable target order', () => {
    const shared = {};
    const fromOnly = {};
    const toOnly = {};
    const from = createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ times: [0], values: [2] }), shared),
        createAnimationChannel(createAnimationTrack({ times: [0], values: [7] }), fromOnly),
      ]),
    );
    const to = createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ times: [0], values: [9] }), toOnly),
        createAnimationChannel(createAnimationTrack({ times: [0], values: [6] }), shared),
      ]),
    );
    const state = createAnimationCrossfade(from, to, 2);
    advanceAnimationCrossfade(state, 1);
    const seen: Array<{ index: number; target: unknown; value: number }> = [];
    sampleAnimationCrossfade([0], state, (sampled, channel, index) => {
      seen.push({ index, target: channel.targetRef, value: sampled[0] });
    });
    expect(seen).toEqual([
      { index: 0, target: shared, value: 4 },
      { index: 1, target: fromOnly, value: 7 },
      { index: 2, target: toOnly, value: 9 },
    ]);
  });

  it('preserves alpha endpoints and reuses scratch buffers', () => {
    const target = {};
    const state = createAnimationCrossfade(player(target, [0, 10]), player(target, [20, 40]), 1);
    const fromSample = state.fromSample;
    const toSample = state.toSample;
    const values: number[] = [];
    sampleAnimationCrossfade([0], state, (sampled) => values.push(sampled[0]));
    advanceAnimationCrossfade(state, 2);
    sampleAnimationCrossfade([0], state, (sampled) => values.push(sampled[0]));
    expect(values).toEqual([0, 20]);
    expect(state.fromSample).toBe(fromSample);
    expect(state.toSample).toBe(toSample);
  });

  it('uses shortest-arc quaternion slerp', () => {
    const target = {};
    const from = player(target, [0, 0, 0, 1, 0, 0, 0, 1], { components: 4, quaternion: true });
    const to = player(target, [0, 0, -1, 0, 0, 0, -1, 0], { components: 4, quaternion: true });
    const state = createAnimationCrossfade(from, to, 1);
    advanceAnimationCrossfade(state, 0.5);
    sampleAnimationCrossfade([0, 0, 0, 0], state, (sampled) => {
      expect(Math.abs(sampled[2])).toBeCloseTo(Math.SQRT1_2);
      expect(Math.abs(sampled[3])).toBeCloseTo(Math.SQRT1_2);
    });
  });
});
