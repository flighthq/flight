import { sampleAnimationTrack } from '@flighthq/animation';
import type { AnimationClip, Mesh, QuaternionLike, SceneAnimationTarget } from '@flighthq/types';

import { setSceneNodePosition, setSceneNodeRotationQuaternion, setSceneNodeScale } from './sceneNodeTransform';

// Samples every channel of `clip` at `time` and applies it to its target's sink — the 3D binding layer
// over the target-free @flighthq/animation core (the core samples values; this maps a channel's opaque
// `targetRef`, a SceneAnimationTarget `{ node, path }`, onto the sink). TRS paths drive the node's
// transform: Translation/Scale consume a Vector3 (3 components), Rotation a unit quaternion (4). The
// Weights path drives the target Mesh's morph-target weight array (Mesh.morph.weights): the channel is
// sampled straight into that array (its width = the mesh's target count), and updateMeshMorph then
// blends the geometry from it. A Weights channel whose target node carries no morph is skipped.
// Channels whose targetRef is not a SceneAnimationTarget are skipped. This is the deformer split — one
// clip/animator/clock, only the sink differs (transform for TRS, weight array for morph).
export function applyAnimationClipToScene(clip: Readonly<AnimationClip>, time: number): void {
  const channels = clip.channels;
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const target = channel.targetRef as SceneAnimationTarget | null;
    if (target === null || typeof target !== 'object' || target.node === undefined) continue;
    if (target.path === 'Weights') {
      const morph = (target.node as Mesh).morph;
      if (morph == null) continue;
      // Sample straight into the live weight array — its length is the track's component width.
      sampleAnimationTrack(morph.weights, channel.track, time);
      continue;
    }
    sampleAnimationTrack(_scratch, channel.track, time);
    if (target.path === 'Translation') {
      setSceneNodePosition(target.node, _scratch[0], _scratch[1], _scratch[2]);
    } else if (target.path === 'Scale') {
      setSceneNodeScale(target.node, _scratch[0], _scratch[1], _scratch[2]);
    } else {
      _scratchQuat.x = _scratch[0];
      _scratchQuat.y = _scratch[1];
      _scratchQuat.z = _scratch[2];
      _scratchQuat.w = _scratch[3];
      setSceneNodeRotationQuaternion(target.node, _scratchQuat);
    }
  }
}

const _scratch = [0, 0, 0, 0];
const _scratchQuat: QuaternionLike = { w: 1, x: 0, y: 0, z: 0 };
