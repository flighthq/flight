import type { AnimationPlayer, AnimationStateMachine } from '@flighthq/types/contract';

import { advanceAnimationPlayers } from './animationAdvance';

// Internal state-machine update with outer-controller-owned player deduplication.
export function advanceAnimationStateMachineWithScratch(
  machine: AnimationStateMachine,
  dt: number,
  advanced: AnimationPlayer[],
): void {
  advanceAnimationPlayers(machine.states[machine.currentStateIndex].blendTree.players, dt, advanced);
  const toIndex = machine.transitionToStateIndex;
  if (toIndex === null) return;
  advanceAnimationPlayers(machine.states[toIndex].blendTree.players, dt, advanced);
  machine.transitionElapsed += dt;
  machine.transitionWeight = machine.transitionCurve(
    getLinearAnimationStateMachineTransitionWeight(machine.transitionElapsed, machine.transitionDuration),
  );
  if (machine.transitionDuration <= 0 || machine.transitionElapsed >= machine.transitionDuration) {
    machine.currentStateIndex = toIndex;
    machine.transitionFromStateIndex = null;
    machine.transitionToStateIndex = null;
  }
}

function getLinearAnimationStateMachineTransitionWeight(elapsed: number, duration: number): number {
  if (duration <= 0) return 1;
  const normalized = elapsed / duration;
  return normalized < 0 ? 0 : normalized > 1 ? 1 : normalized;
}
