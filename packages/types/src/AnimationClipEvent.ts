import type { Entity } from './Entity';

// One clip-owned marker. Payload remains opaque to the animation core; gameplay/audio/VFX consumers
// interpret it when an AnimationPlayer reports the crossing through its opt-in onEvent signal.
export interface AnimationClipEvent extends Entity {
  name: string;
  payload: unknown;
  time: number;
}
