import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AnimationPlayer } from '@flighthq/types/contract';

import { createAnimationBlendTree, createAnimationBlendTreeInput } from './animationBlendTree';
import { createAnimationChannel, createAnimationClip } from './animationClip';
import { createAnimationPlayer } from './animationPlayer';
import {
  advanceAnimationStateMachine,
  createAnimationStateMachine,
  createAnimationStateMachineState,
  getAnimationStateMachineCurrentState,
  initializeAnimationStateMachine,
  initializeAnimationStateMachineState,
  isAnimationStateMachineTransitioning,
  sampleAnimationStateMachine,
  sampleAnimationStateMachineChannel,
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

function state(name: string, ...players: AnimationPlayer[]) {
  return createAnimationStateMachineState(
    name,
    createAnimationBlendTree(players.map((animationPlayer) => createAnimationBlendTreeInput(animationPlayer))),
  );
}

describe('advanceAnimationStateMachine', () => {
  it('advances both transition states, de-duplicates players, and completes by duration', () => {
    const target = {};
    const shared = player(target, 0, 4);
    const destination = player(target, 20, 4);
    const machine = createAnimationStateMachine([state('idle', shared), state('walk', shared, destination)]);
    const advanceScratch = machine.advanceScratch;
    expect(transitionAnimationStateMachine(machine, 'walk', 1)).toBe(true);
    advanceAnimationStateMachine(machine, 0.5);
    expect(shared.time).toBe(0.5);
    expect(destination.time).toBe(0.5);
    expect(machine.advanceScratch).toBe(advanceScratch);
    expect(machine.advanceScratch).toEqual([shared, destination]);
    expect(machine.transitionWeight).toBe(0.5);
    advanceAnimationStateMachine(machine, 0.5);
    expect(getAnimationStateMachineCurrentState(machine).name).toBe('walk');
    expect(isAnimationStateMachineTransitioning(machine)).toBe(false);
  });
});

describe('createAnimationStateMachine', () => {
  it('creates an Entity with named initial state and global target correspondence', () => {
    const shared = {};
    const idleOnly = {};
    const machine = createAnimationStateMachine(
      [state('idle', player(shared, 0), player(idleOnly, 1)), state('walk', player(shared, 2))],
      'walk',
    );
    expect(EntityRuntimeKey in machine).toBe(true);
    expect(getAnimationStateMachineCurrentState(machine).name).toBe('walk');
    expect(machine.channels).toHaveLength(2);
    expect(machine.channels[0].stateChannelIndices).toEqual([0, 0]);
    expect(machine.channels[1].stateChannelIndices).toEqual([1, null]);
  });

  it('rejects empty, duplicate-named, missing-initial, and incompatible states', () => {
    expect(() => createAnimationStateMachine([])).toThrow(/at least one state/);
    const a = state('same', player({}, 0));
    const b = state('same', player({}, 1));
    expect(() => createAnimationStateMachine([a, b])).toThrow(/duplicate state/);
    expect(() => createAnimationStateMachine([a], 'missing')).toThrow(/does not exist/);
    expect(() => createAnimationStateMachine([a], 0.5)).toThrow(/does not exist/);

    const target = {};
    const scalar = state('scalar', player(target, 0));
    const vectorPlayer = createAnimationPlayer(
      createAnimationClip([
        createAnimationChannel(createAnimationTrack({ components: 2, times: [0], values: [0, 1] }), target),
      ]),
    );
    expect(() => createAnimationStateMachine([scalar, state('vector', vectorPlayer)])).toThrow(/incompatible/);
  });
});

describe('createAnimationStateMachineState', () => {
  it('creates a named Entity over a caller-owned blend tree', () => {
    const tree = createAnimationBlendTree([]);
    const result = createAnimationStateMachineState('empty', tree);
    expect(EntityRuntimeKey in result).toBe(true);
    expect(result.blendTree).toBe(tree);
    expect(result.name).toBe('empty');
  });
});

describe('getAnimationStateMachineCurrentState', () => {
  it('keeps the source current until transition completion', () => {
    const machine = createAnimationStateMachine([state('a', player({}, 0)), state('b', player({}, 1))]);
    transitionAnimationStateMachine(machine, 'b', 1);
    expect(getAnimationStateMachineCurrentState(machine).name).toBe('a');
  });
});

describe('initializeAnimationStateMachine', () => {
  it('is the construction initializer of createAnimationStateMachine', () => {
    expect(typeof initializeAnimationStateMachine).toBe('function');
  });
});

describe('initializeAnimationStateMachineState', () => {
  it('is the construction initializer of createAnimationStateMachineState', () => {
    expect(typeof initializeAnimationStateMachineState).toBe('function');
  });
});

describe('isAnimationStateMachineTransitioning', () => {
  it('tracks the active timed-transition lifecycle', () => {
    const machine = createAnimationStateMachine([state('a', player({}, 0)), state('b', player({}, 1))]);
    expect(isAnimationStateMachineTransitioning(machine)).toBe(false);
    transitionAnimationStateMachine(machine, 'b', 1);
    expect(isAnimationStateMachineTransitioning(machine)).toBe(true);
  });
});

describe('sampleAnimationStateMachine', () => {
  it('samples a current N-way blend tree', () => {
    const target = {};
    const tree = createAnimationBlendTree([
      createAnimationBlendTreeInput(player(target, 0), 1),
      createAnimationBlendTreeInput(player(target, 20), 3),
    ]);
    const machine = createAnimationStateMachine([createAnimationStateMachineState('locomotion', tree)]);
    const seen: number[] = [];
    sampleAnimationStateMachine([0], machine, (sampled) => seen.push(sampled[0]));
    expect(seen).toEqual([15]);
  });

  it('blends matching targets and passes one-sided targets through during transition', () => {
    const shared = {};
    const fromOnly = {};
    const toOnly = {};
    const machine = createAnimationStateMachine([
      state('from', player(shared, 0), player(fromOnly, 3)),
      state('to', player(shared, 20), player(toOnly, 7)),
    ]);
    transitionAnimationStateMachine(machine, 'to', 2);
    advanceAnimationStateMachine(machine, 1);
    const seen: Array<{ target: unknown; value: number }> = [];
    sampleAnimationStateMachine([0], machine, (sampled, channel) =>
      seen.push({ target: channel.targetRef, value: sampled[0] }),
    );
    expect(seen).toEqual([
      { target: shared, value: 10 },
      { target: fromOnly, value: 3 },
      { target: toOnly, value: 7 },
    ]);
  });
});
describe('sampleAnimationStateMachineChannel', () => {
  it('samples one global channel and preserves output for an absent index', () => {
    const machine = createAnimationStateMachine([state('only', player({}, 7))]);
    const out = [99];
    expect(sampleAnimationStateMachineChannel(out, machine, 0)).toBe(true);
    expect(out).toEqual([7]);
    expect(sampleAnimationStateMachineChannel(out, machine, 3)).toBe(false);
    expect(out).toEqual([7]);
  });
});

describe('transitionAnimationStateMachine', () => {
  it('supports curved and zero-duration transitions', () => {
    const machine = createAnimationStateMachine([state('a', player({}, 0)), state('b', player({}, 1))]);
    expect(transitionAnimationStateMachine(machine, 'b', 2, (t) => t * t)).toBe(true);
    advanceAnimationStateMachine(machine, 1);
    expect(machine.transitionWeight).toBe(0.25);

    advanceAnimationStateMachine(machine, 1);
    expect(transitionAnimationStateMachine(machine, 'a', 0)).toBe(true);
    expect(getAnimationStateMachineCurrentState(machine).name).toBe('a');
  });

  it('rejects unknown, same-state, and overlapping transition requests', () => {
    const machine = createAnimationStateMachine([state('a', player({}, 0)), state('b', player({}, 1))]);
    expect(transitionAnimationStateMachine(machine, 'missing', 1)).toBe(false);
    expect(transitionAnimationStateMachine(machine, 0.5, 1)).toBe(false);
    expect(transitionAnimationStateMachine(machine, 'a', 1)).toBe(false);
    expect(transitionAnimationStateMachine(machine, 'b', 1)).toBe(true);
    expect(transitionAnimationStateMachine(machine, 'a', 1)).toBe(false);
  });
});
