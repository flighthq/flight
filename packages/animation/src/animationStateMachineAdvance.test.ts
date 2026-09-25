import { createAnimationBlendTree, createAnimationBlendTreeInput } from './animationBlendTree.ts';
import { createAnimationChannel, createAnimationClip } from './animationClip.ts';
import { createAnimationPlayer } from './animationPlayer.ts';
import { createAnimationStateMachine, createAnimationStateMachineState } from './animationStateMachine.ts';
import { advanceAnimationStateMachineWithScratch } from './animationStateMachineAdvance.ts';
import { createAnimationTrack } from './animationTrack.ts';

describe('advanceAnimationStateMachineWithScratch', () => {
  it('uses outer-controller scratch while advancing players', () => {
    const player = createAnimationPlayer(
      createAnimationClip([createAnimationChannel(createAnimationTrack({ times: [0, 2], values: [0, 1] }), {})]),
    );
    const machine = createAnimationStateMachine([
      createAnimationStateMachineState('only', createAnimationBlendTree([createAnimationBlendTreeInput(player)])),
    ]);
    const advanced: typeof machine.advanceScratch = [];
    advanceAnimationStateMachineWithScratch(machine, 0.5, advanced);
    expect(player.time).toBe(0.5);
    expect(advanced).toEqual([player]);
  });
});
