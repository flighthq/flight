import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AnimationBlendTree, AnimationChannel, AnimationPlayer } from '@flighthq/types/contract';

import { createAnimationBlendTree, createAnimationBlendTreeInput } from './animationBlendTree';
import { createAnimationChannel, createAnimationClip } from './animationClip';
import {
  advanceAnimationLayerStack,
  createAnimationBlendTreeLayer,
  createAnimationLayerStack,
  createAnimationStateMachineLayer,
  initializeAnimationLayerStack,
  sampleAnimationLayerStack,
  sampleAnimationLayerStackChannel,
  setAnimationLayerWeight,
} from './animationLayerStack';
import { createAnimationPlayer } from './animationPlayer';
import {
  createAnimationStateMachine,
  createAnimationStateMachineState,
  transitionAnimationStateMachine,
} from './animationStateMachine';
import { createAnimationTrack } from './animationTrack';

function player(targetRef: unknown, value: number, duration = 0): AnimationPlayer {
  const times = duration > 0 ? [0, duration] : [0];
  const values = duration > 0 ? [value, value + 10] : [value];
  return createAnimationPlayer(
    createAnimationClip([createAnimationChannel(createAnimationTrack({ times, values }), targetRef)]),
  );
}

function tree(...players: AnimationPlayer[]): AnimationBlendTree {
  return createAnimationBlendTree(players.map((animationPlayer) => createAnimationBlendTreeInput(animationPlayer)));
}

describe('advanceAnimationLayerStack', () => {
  it('reuses stack scratch and advances shared players and sources once', () => {
    const target = {};
    const shared = player(target, 0, 4);
    const sharedTree = tree(shared);
    const machine = createAnimationStateMachine([createAnimationStateMachineState('only', tree(shared))]);
    const stack = createAnimationLayerStack([
      createAnimationBlendTreeLayer(sharedTree),
      createAnimationBlendTreeLayer(sharedTree),
      createAnimationStateMachineLayer(machine),
    ]);
    const advanceScratch = stack.advanceScratch;

    advanceAnimationLayerStack(stack, 0.5);

    expect(shared.time).toBe(0.5);
    expect(stack.advanceScratch).toBe(advanceScratch);
    expect(stack.advanceScratch).toEqual([shared]);
    expect(stack.blendTrees).toEqual([sharedTree]);
    expect(stack.stateMachines).toEqual([machine]);
  });
});

describe('createAnimationBlendTreeLayer', () => {
  it('creates an Entity and validates a stable channel-index subset', () => {
    const source = tree(player({}, 1), player({}, 2));
    const layer = createAnimationBlendTreeLayer(source, { additive: true, channelIndices: [1, 0], weight: 0.5 });
    expect(EntityRuntimeKey in layer).toBe(true);
    expect(layer.blendTree).toBe(source);
    expect(layer.stateMachine).toBeNull();
    expect(layer.channelIndices).toEqual([0, 1]);
    expect(layer.additive).toBe(true);
    expect(layer.weight).toBe(0.5);
    expect(() => createAnimationBlendTreeLayer(source, { channelIndices: [0, 0] })).toThrow(/duplicated/);
    expect(() => createAnimationBlendTreeLayer(source, { channelIndices: [2] })).toThrow(/does not exist/);
  });
});

describe('createAnimationLayerStack', () => {
  it('precomputes target correspondence from only selected source channels', () => {
    const a = {};
    const b = {};
    const source = tree(player(a, 1), player(b, 2));
    const stack = createAnimationLayerStack([createAnimationBlendTreeLayer(source, { channelIndices: [1] })]);
    expect(EntityRuntimeKey in stack).toBe(true);
    expect(stack.channels).toHaveLength(1);
    expect(stack.channels[0].channel.targetRef).toBe(b);
  });

  it('rejects incompatible tracks for the same target', () => {
    const target = {};
    const scalar = tree(player(target, 1));
    const vector = tree(
      createAnimationPlayer(
        createAnimationClip([
          createAnimationChannel(createAnimationTrack({ components: 2, times: [0], values: [1, 2] }), target),
        ]),
      ),
    );
    expect(() =>
      createAnimationLayerStack([createAnimationBlendTreeLayer(scalar), createAnimationBlendTreeLayer(vector)]),
    ).toThrow(/incompatible tracks/);
  });
});

describe('createAnimationStateMachineLayer', () => {
  it('creates a layer over the machine global channel layout', () => {
    const source = createAnimationStateMachine([createAnimationStateMachineState('only', tree(player({}, 1)))]);
    const layer = createAnimationStateMachineLayer(source);
    expect(EntityRuntimeKey in layer).toBe(true);
    expect(layer.blendTree).toBeNull();
    expect(layer.stateMachine).toBe(source);
  });
});

describe('initializeAnimationLayerStack', () => {
  it('is the construction initializer of createAnimationLayerStack', () => {
    expect(typeof initializeAnimationLayerStack).toBe('function');
  });
});

describe('sampleAnimationLayerStack', () => {
  it('applies an override mask and additive layer in stable target order', () => {
    const body = {};
    const arm = {};
    const base = tree(player(body, 4), player(arm, 10));
    const upper = tree(player(body, 100), player(arm, 30));
    const additive = tree(player(arm, 8));
    const stack = createAnimationLayerStack([
      createAnimationBlendTreeLayer(base),
      createAnimationBlendTreeLayer(upper, { channelIndices: [1], weight: 0.5 }),
      createAnimationBlendTreeLayer(additive, { additive: true, weight: 0.25 }),
    ]);
    const seen: Array<{ target: unknown; value: number }> = [];

    sampleAnimationLayerStack([0], stack, (sampled, channel) =>
      seen.push({ target: channel.targetRef, value: sampled[0] }),
    );

    expect(seen).toEqual([
      { target: body, value: 4 },
      { target: arm, value: 22 },
    ]);
  });

  it('samples a transitioning state-machine layer', () => {
    const target = {};
    const machine = createAnimationStateMachine([
      createAnimationStateMachineState('from', tree(player(target, 0))),
      createAnimationStateMachineState('to', tree(player(target, 20))),
    ]);
    transitionAnimationStateMachine(machine, 'to', 2);
    machine.transitionElapsed = 1;
    machine.transitionWeight = 0.5;
    const seen: number[] = [];
    sampleAnimationLayerStack([0], createAnimationLayerStack([createAnimationStateMachineLayer(machine)]), (sampled) =>
      seen.push(sampled[0]),
    );
    expect(seen).toEqual([10]);
  });
});

describe('sampleAnimationLayerStackChannel', () => {
  it('uses identity for an additive-only target and preserves output for an absent channel', () => {
    const stack = createAnimationLayerStack([
      createAnimationBlendTreeLayer(tree(player({}, 8)), { additive: true, weight: 0.25 }),
    ]);
    const out = [99];
    expect(sampleAnimationLayerStackChannel(out, stack, 0)).toBe(true);
    expect(out).toEqual([2]);
    expect(sampleAnimationLayerStackChannel(out, stack, 4)).toBe(false);
    expect(out).toEqual([2]);
  });
});
describe('setAnimationLayerWeight', () => {
  it('updates a present layer and rejects an absent index', () => {
    const stack = createAnimationLayerStack([createAnimationBlendTreeLayer(tree(player({}, 1)))]);
    expect(setAnimationLayerWeight(stack, 0, 0.25)).toBe(true);
    expect(stack.layers[0].weight).toBe(0.25);
    expect(setAnimationLayerWeight(stack, 2, 1)).toBe(false);
  });
});
