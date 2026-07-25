import { sampleAnimationTrack } from '@flighthq/animation';
import { invalidateNodeAppearance, invalidateNodeLocalTransform } from '@flighthq/node';
import type { AnimationClip, DisplayObjectAnimationTarget } from '@flighthq/types';

// Samples a target-free clip and applies channels carrying DisplayObjectAnimationTarget descriptors.
// Unknown target refs and paths are ignored, matching the scene/skeleton binding layers. Transform
// paths invalidate local matrices; alpha/visibility paths invalidate appearance.
export function applyAnimationClipToDisplayObject(clip: Readonly<AnimationClip>, time: number): void {
  for (const channel of clip.channels) {
    const target = channel.targetRef as DisplayObjectAnimationTarget | null;
    if (target === null || typeof target !== 'object' || target.node === undefined) continue;
    sampleAnimationTrack(_scratch, channel.track, time);
    const node = target.node;
    switch (target.path) {
      case 'Alpha':
        node.alpha = _scratch[0];
        invalidateNodeAppearance(node);
        break;
      case 'Pivot':
        node.pivotX = _scratch[0];
        node.pivotY = _scratch[1];
        invalidateNodeLocalTransform(node);
        break;
      case 'Position':
        node.x = _scratch[0];
        node.y = _scratch[1];
        invalidateNodeLocalTransform(node);
        break;
      case 'Rotation':
        node.rotation = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'Scale':
        node.scaleX = _scratch[0];
        node.scaleY = _scratch[1];
        invalidateNodeLocalTransform(node);
        break;
      case 'Skew':
        node.skewX = _scratch[0];
        node.skewY = _scratch[1];
        invalidateNodeLocalTransform(node);
        break;
      case 'Visible':
        node.visible = _scratch[0] >= 0.5;
        invalidateNodeAppearance(node);
        break;
    }
  }
}

const _scratch = [0, 0, 0, 0];
