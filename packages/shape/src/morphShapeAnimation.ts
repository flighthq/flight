import { sampleAnimationClip } from '@flighthq/animation/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AnimationChannel,
  AnimationClip,
  EntityConstruction,
  MorphShape,
  MorphShapeAnimationTarget,
} from '@flighthq/types/contract';
import { MorphShapeKind } from '@flighthq/types/contract';

import { setMorphShapeProgress } from './morphShape';

// Samples every channel at `time` and applies the channels carrying MorphShapeAnimationTarget refs.
// Foreign targets are ignored, so one clip may compose MorphShape progress with other domain sinks.
export function applyAnimationClipToMorphShape(clip: Readonly<AnimationClip>, time: number): void {
  sampleAnimationClip(morphShapeAnimationScratch, clip, time, applyMorphShapeAnimationSample);
}

// Allocation-free visitor shared by clip, crossfade, blend-tree, state-machine, and layer-stack
// samplers. Returns whether the channel carried a valid MorphShape animation target.
export function applyMorphShapeAnimationSample(
  sampled: Readonly<ArrayLike<number>>,
  channel: Readonly<AnimationChannel>,
): boolean {
  const target = channel.targetRef as MorphShapeAnimationTarget | null;
  if (target === null || typeof target !== 'object' || target.shape === undefined) return false;
  const shape = target.shape as MorphShape | null;
  if (shape === null || typeof shape !== 'object' || shape.kind !== MorphShapeKind) return false;
  setMorphShapeProgress(shape, sampled[0]);
  return true;
}

// Allocates one stable binding descriptor. Keep and reuse this identity when multiple animation
// controllers should recognize their MorphShape progress channels as the same target.
export function createMorphShapeAnimationTarget(shape: MorphShape): MorphShapeAnimationTarget {
  const out = allocateEntity<MorphShapeAnimationTarget>();
  out.shape = shape;
  return finishEntity(out);
}

const morphShapeAnimationScratch: number[] = [0];
