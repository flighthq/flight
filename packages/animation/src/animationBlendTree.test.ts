import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AnimationChannel, AnimationPlayer } from '@flighthq/types/contract';

import {
  advanceAnimationBlendTree,
  createAnimationBlendTree,
  createAnimationBlendTreeInput,
  initializeAnimationBlendTree,
  initializeAnimationBlendTreeInput,
  sampleAnimationBlendTree,
  sampleAnimationBlendTreeChannel,
  setAnimationBlendTreeInputWeight,
} from './animationBlendTree';
import { createAnimationChannel, createAnimationClip } from './animationClip';
import { createAnimationPlayer } from './animationPlayer';
import { createAnimationTrack } from './animationTrack';

function player(targetRef: unknown, value: number, duration = 0): AnimationPlayer {
  const times = duration > 0 ? [0, duration] : [0];
  const values = duration > 0 ? [value, value + 10] : [value];
  return createAnimationPlayer(
    createAnimationClip([createAnimationChannel(createAnimationTrack({ times, values }), targetRef)]),
  );
}

function quaternionPlayer(targetRef: unknown, values: readonly number[]): AnimationPlayer {
  return createAnimationPlayer(
    createAnimationClip([
      createAnimationChannel(createAnimationTrack({ components: 4, quaternion: true, times: [0], values }), targetRef),
    ]),
  );
}

describe('advanceAnimationBlendTree', () => {
  it('advances a shared player only once', () => {
    const shared = player({}, 0, 2);
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(shared, 0.25),
      createAnimationBlendTreeInput(shared, 0.75),
    ]);
    const players = tree.players;
    expect(players).toEqual([shared]);
    advanceAnimationBlendTree(tree, 0.5);
    expect(shared.time).toBe(0.5);
    expect(tree.players).toBe(players);
  });
});

describe('createAnimationBlendTree', () => {
  it('creates an Entity with target-matched reusable channels', () => {
    const target = {};
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(player(target, 1)),
      createAnimationBlendTreeInput(player(target, 2)),
    ]);
    expect(EntityRuntimeKey in tree).toBe(true);
    expect(tree.channels).toHaveLength(1);
    expect(tree.channels[0].sources).toEqual([
      { channelIndex: 0, inputIndex: 0 },
      { channelIndex: 0, inputIndex: 1 },
    ]);
  });

  it('rejects duplicate and incompatible target channels', () => {
    const target = {};
    const track = createAnimationTrack({ times: [0], values: [1] });
    const duplicate = createAnimationPlayer(
      createAnimationClip([createAnimationChannel(track, target), createAnimationChannel(track, target)]),
    );
    expect(() => createAnimationBlendTree([createAnimationBlendTreeInput(duplicate)])).toThrow(/duplicate targetRef/);

    const scalar = player(target, 1);
    const vector = createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ components: 2, times: [0], values: [1, 2] }), target),
      ]),
    );
    expect(() =>
      createAnimationBlendTree([createAnimationBlendTreeInput(scalar), createAnimationBlendTreeInput(vector)]),
    ).toThrow(/different component widths/);
  });
});

describe('createAnimationBlendTreeInput', () => {
  it('creates a mutable weighted leaf with override defaults', () => {
    const input = createAnimationBlendTreeInput(player({}, 1));
    expect(EntityRuntimeKey in input).toBe(true);
    expect(input.weight).toBe(1);
    expect(input.additive).toBe(false);
  });
});

describe('initializeAnimationBlendTree', () => {
  it('is the construction initializer of createAnimationBlendTree', () => {
    expect(typeof initializeAnimationBlendTree).toBe('function');
  });
});

describe('initializeAnimationBlendTreeInput', () => {
  it('is the construction initializer of createAnimationBlendTreeInput', () => {
    expect(typeof initializeAnimationBlendTreeInput).toBe('function');
  });
});

describe('sampleAnimationBlendTree', () => {
  it('normalizes an N-way weighted pose by target identity', () => {
    const target = {};
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(player(target, 0), 1),
      createAnimationBlendTreeInput(player(target, 10), 2),
      createAnimationBlendTreeInput(player(target, 20), 1),
    ]);
    const seen: Array<{ channel: Readonly<AnimationChannel>; value: number }> = [];
    sampleAnimationBlendTree([0], tree, (sampled, channel) => seen.push({ channel, value: sampled[0] }));
    expect(seen).toHaveLength(1);
    expect(seen[0].channel.targetRef).toBe(target);
    expect(seen[0].value).toBe(10);
  });

  it('keeps one-sided targets in stable first-appearance order', () => {
    const a = {};
    const b = {};
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(player(a, 3)),
      createAnimationBlendTreeInput(player(b, 7)),
    ]);
    const seen: Array<{ target: unknown; value: number }> = [];
    sampleAnimationBlendTree([0], tree, (sampled, channel) =>
      seen.push({ target: channel.targetRef, value: sampled[0] }),
    );
    expect(seen).toEqual([
      { target: a, value: 3 },
      { target: b, value: 7 },
    ]);
  });

  it('applies additive deltas after the normalized override pose', () => {
    const target = {};
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(player(target, 10)),
      createAnimationBlendTreeInput(player(target, 4), 0.5, true),
    ]);
    const seen: number[] = [];
    sampleAnimationBlendTree([0], tree, (sampled) => seen.push(sampled[0]));
    expect(seen).toEqual([12]);
  });

  it('hemisphere-aligns override quaternions and composes additive rotation', () => {
    const target = {};
    const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const halfTurn = [0, 0, 1, 0];
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(quaternionPlayer(target, quarterTurn)),
      createAnimationBlendTreeInput(
        quaternionPlayer(
          target,
          quarterTurn.map((value) => -value),
        ),
      ),
      createAnimationBlendTreeInput(quaternionPlayer(target, halfTurn), 0.5, true),
    ]);
    const seen: number[][] = [];
    sampleAnimationBlendTree([0, 0, 0, 0], tree, (sampled) => seen.push(Array.from(sampled).slice(0, 4)));
    expect(seen).toHaveLength(1);
    expect(Math.hypot(...seen[0])).toBeCloseTo(1);
    expect(Math.abs(seen[0][3])).toBeCloseTo(0);
  });

  it('uses identity as the base of an additive-only channel', () => {
    const target = {};
    const tree = createAnimationBlendTree([createAnimationBlendTreeInput(player(target, 8), 0.25, true)]);
    const seen: number[] = [];
    sampleAnimationBlendTree([99], tree, (sampled) => seen.push(sampled[0]));
    expect(seen).toEqual([2]);
  });

  it('skips targets whose weights are all non-positive', () => {
    const tree = createAnimationBlendTree([createAnimationBlendTreeInput(player({}, 8), 0)]);
    const visit = vi.fn();
    sampleAnimationBlendTree([99], tree, visit);
    expect(visit).not.toHaveBeenCalled();
  });
});
describe('sampleAnimationBlendTreeChannel', () => {
  it('returns false and preserves output for an absent channel', () => {
    const out = [9];
    expect(sampleAnimationBlendTreeChannel(out, createAnimationBlendTree([]), 0)).toBe(false);
    expect(out).toEqual([9]);
  });
});

describe('setAnimationBlendTreeInputWeight', () => {
  it('updates a present leaf and rejects an absent index', () => {
    const tree = createAnimationBlendTree([createAnimationBlendTreeInput(player({}, 1))]);
    expect(setAnimationBlendTreeInputWeight(tree, 0, 0.25)).toBe(true);
    expect(tree.inputs[0].weight).toBe(0.25);
    expect(setAnimationBlendTreeInputWeight(tree, 4, 1)).toBe(false);
  });
});
