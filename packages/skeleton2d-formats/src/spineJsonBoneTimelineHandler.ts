import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { createSkeleton2DBoneAnimationTarget } from '@flighthq/skeleton2d/contract';
import type { ImportDiagnostic, SpineJsonTimelineContext } from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  Skeleton2DAnimationPath,
} from '@flighthq/types/contract';

import { buildSpineSegmentEasings, indexOfBone, numberOr } from './spineParseHelpers.ts';

export function spineJsonBoneTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  if (animEntry.bones === null || typeof animEntry.bones !== 'object') return;
  const bones = context.section.bones;
  for (const [boneName, timelinesEntry] of Object.entries(animEntry.bones as Record<string, unknown>)) {
    const boneIndex = indexOfBone(bones, boneName);
    if (boneIndex < 0 || timelinesEntry === null || typeof timelinesEntry !== 'object') continue;
    const timelines = timelinesEntry as Record<string, unknown>;
    addSpineBoneChannel(
      context.channels,
      timelines.rotate,
      boneIndex,
      Skeleton2DAnimationPath.Rotation,
      1,
      (k) => [numberOr(k.value, 0)],
      context.section.diagnostics,
    );
    addSpineBoneChannel(
      context.channels,
      timelines.translate,
      boneIndex,
      Skeleton2DAnimationPath.Translation,
      2,
      (k) => [numberOr(k.x, 0), numberOr(k.y, 0)],
      context.section.diagnostics,
    );
    addSpineBoneChannel(
      context.channels,
      timelines.scale,
      boneIndex,
      Skeleton2DAnimationPath.Scale,
      2,
      (k) => [numberOr(k.x, 1), numberOr(k.y, 1)],
      context.section.diagnostics,
    );
    addSpineBoneChannel(
      context.channels,
      timelines.shear,
      boneIndex,
      Skeleton2DAnimationPath.Shear,
      2,
      (k) => [numberOr(k.x, 0), numberOr(k.y, 0)],
      context.section.diagnostics,
    );
    for (const axis of SPINE_BONE_AXIS_TIMELINES) {
      addSpineBoneChannel(
        context.channels,
        timelines[axis.key],
        boneIndex,
        axis.path,
        1,
        (k) => [numberOr(k.value, axis.identity)],
        context.section.diagnostics,
      );
    }
  }
}

export const spineJsonBoneTimelineReader = spineJsonBoneTimelineHandler;

// Adds one bone-timeline channel to `channels`: builds an AnimationTrack from the Spine keyframes (times
// + `extract`ed component values, with the setup pose already baked into `extract`) targeting the bone's
// `path`. A timeline whose every keyframe is `curve: 'stepped'` is a Step track; otherwise Linear.
//
// A keyframe may instead carry `curve` as an array of cubic-bezier control points, which becomes a
// per-interval `segmentEasings` entry on the track (see buildSpineSegmentEasings).
function addSpineBoneChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: unknown,
  boneIndex: number,
  path: (typeof Skeleton2DAnimationPath)[keyof typeof Skeleton2DAnimationPath],
  components: number,
  extract: (key: Record<string, unknown>) => readonly number[],
  diagnostics?: ImportDiagnostic[],
): void {
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) return;
  const keys: Record<string, unknown>[] = [];
  const times: number[] = [];
  const values: number[] = [];
  let allStepped = true;
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    keys.push(k);
    times.push(numberOr(k.time, 0));
    for (const component of extract(k)) values.push(component);
    if (k.curve !== 'stepped') allStepped = false;
  }
  const interpolation = allStepped ? AnimationInterpolationStep : AnimationInterpolationLinear;
  const segmentEasings = buildSpineSegmentEasings(keys, times, values, components, diagnostics);
  const track = createAnimationTrack({ components, interpolation, segmentEasings, times, values });
  channels.push(createAnimationChannel(track, createSkeleton2DBoneAnimationTarget(boneIndex, path)));
}

// Spine 4's per-axis bone timelines: the JSON key, the path it drives, and the delta that means "no
// change" for that field (1 for a scale multiplier, 0 for the additive ones).
const SPINE_BONE_AXIS_TIMELINES = [
  { identity: 0, key: 'translatex', path: Skeleton2DAnimationPath.TranslationX },
  { identity: 0, key: 'translatey', path: Skeleton2DAnimationPath.TranslationY },
  { identity: 1, key: 'scalex', path: Skeleton2DAnimationPath.ScaleX },
  { identity: 1, key: 'scaley', path: Skeleton2DAnimationPath.ScaleY },
  { identity: 0, key: 'shearx', path: Skeleton2DAnimationPath.ShearX },
  { identity: 0, key: 'sheary', path: Skeleton2DAnimationPath.ShearY },
] as const;
