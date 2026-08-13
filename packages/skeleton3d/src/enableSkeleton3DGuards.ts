import { logOnce } from '@flighthq/log/contract';
import type { Skeleton3D } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSkeleton3DBindPoseGuard } from './skeleton3d';

export function areSkeleton3DGuardsEnabled(): boolean {
  return skeleton3DGuardsEnabled;
}

export function disableSkeleton3DGuards(): void {
  setSkeleton3DBindPoseGuard(null);
  skeleton3DGuardsEnabled = false;
}

// Installs opt-in diagnostics for skeleton operations that substitute a value rather than compute one.
// The core modules stay message-free, so an application that omits this one sheds both the text and
// @flighthq/log.
export function enableSkeleton3DGuards(): void {
  setSkeleton3DBindPoseGuard(warnOnDegenerateSkeleton3DBindPose);
  skeleton3DGuardsEnabled = true;
}

// The substituted identity is a deliberate recovery, not a computed result: that one joint captures no
// bind pose and renders undeformed while the rest of the rig works. Nothing else reports it, and the
// symptom — one limb that will not deform — points at the mesh rather than at the joint's scale.
function warnOnDegenerateSkeleton3DBindPose(skeleton: Readonly<Skeleton3D>, jointIndex: number): void {
  logOnce(`skeleton3d:degenerate-bind-pose:${jointIndex}`, LogLevel.Warn, {
    joint: skeleton.joints[jointIndex]?.name ?? '<unnamed>',
    jointIndex,
    message:
      'setSkeleton3DBindPose: a joint has no invertible world matrix, so its inverse-bind entry was set to identity and that joint will not deform — a zero scale on the joint or an ancestor is the usual cause, and an imported rig can carry one.',
  });
}

let skeleton3DGuardsEnabled = false;
