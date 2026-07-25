import type { AnimationChannel } from './AnimationChannel';
import type { AnimationClip } from './AnimationClip';
import type { Entity } from './Entity';

// Reusable target-free root-motion extraction state for one caller-selected clip channel. Vector
// channels produce additive component deltas; quaternion channels produce a compositional rotation
// delta. Callers create separate extractors when translation and rotation use separate channels.
export interface AnimationRootMotionExtractor extends Entity {
  channel: Readonly<AnimationChannel>;
  channelIndex: number;
  clip: Readonly<AnimationClip>;
  cycleDelta: Float32Array;
  fromMotion: Float32Array;
  fromSample: Float32Array;
  powerScratch: Float32Array;
  startSample: Float32Array;
  toMotion: Float32Array;
  toSample: Float32Array;
}
