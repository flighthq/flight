import type { AnimationChannel } from './AnimationChannel';

// A bundle of channels with a total `duration` in seconds. Sampling a clip means sampling each
// channel's track at the playhead time (sampleAnimationTrack) and applying it to that channel's
// `targetRef` — the apply step is the domain layer's, keeping the clip itself target-free.
export interface AnimationClip {
  channels: AnimationChannel[];
  duration: number;
}
