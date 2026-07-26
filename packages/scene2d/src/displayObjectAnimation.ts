import { sampleAnimationTrack } from '@flighthq/animation/contract';
import { invalidateNodeAppearance, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import type { AnimationClip, Node2DAnimationTarget } from '@flighthq/types/contract';

// Samples a target-free clip and applies channels carrying Node2DAnimationTarget descriptors.
// Unknown target refs and paths are ignored, matching the scene/skeleton binding layers. Transform
// paths invalidate local matrices; alpha/visibility paths invalidate appearance.
export function applyAnimationClipToNode2D(clip: Readonly<AnimationClip>, time: number): void {
  for (const channel of clip.channels) {
    const target = channel.targetRef as Node2DAnimationTarget | null;
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
      case 'PivotX':
        node.pivotX = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'PivotY':
        node.pivotY = _scratch[0];
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
      case 'ScaleX':
        node.scaleX = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'ScaleY':
        node.scaleY = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'Skew':
        node.skewX = _scratch[0];
        node.skewY = _scratch[1];
        invalidateNodeLocalTransform(node);
        break;
      case 'SkewX':
        node.skewX = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'SkewY':
        node.skewY = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'Visible':
        node.visible = _scratch[0] >= 0.5;
        invalidateNodeAppearance(node);
        break;
      case 'X':
        node.x = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
      case 'Y':
        node.y = _scratch[0];
        invalidateNodeLocalTransform(node);
        break;
    }
  }
}

const _scratch = [0, 0, 0, 0];
