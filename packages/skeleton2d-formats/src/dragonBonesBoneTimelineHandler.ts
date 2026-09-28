import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { createSkeleton2DBoneAnimationTarget } from '@flighthq/skeleton2d/contract';
import type {
  AnimationChannel,
  AnimationInterpolation,
  DragonBonesTimelineContext,
  EasingFunction,
  ImportDiagnostic,
} from '@flighthq/types/contract';
import { Skeleton2DAnimationPath } from '@flighthq/types/contract';

import {
  buildDragonBonesSegmentEasings,
  dragonBonesFrameTimes,
  dragonBonesFrames,
  dragonBonesInterpolation,
  numberOr,
  skipCrumbDragonBonesGroup,
} from './dragonBonesParseHelpers.ts';

export function dragonBonesBoneTimelineHandler(
  context: DragonBonesTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  if (!Array.isArray(animEntry.bone)) return;
  for (const rawTimeline of animEntry.bone) {
    if (rawTimeline === null || typeof rawTimeline !== 'object') continue;
    const timeline = rawTimeline as Record<string, unknown>;
    const boneIndex =
      typeof timeline.name === 'string' ? (context.section.boneIndexByName.get(timeline.name) ?? -1) : -1;
    if (boneIndex < 0) {
      context.unresolvedBoneCount++;
      continue;
    }
    parseDragonBonesBoneTimeline(
      context.channels,
      timeline,
      boneIndex,
      context.section.frameRate,
      context.section.diagnostics,
    );
  }
}

export const dragonBonesBoneTimelineReader: (
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void = dragonBonesBoneTimelineHandler;

function addDragonBonesBoneChannel(
  channels: AnimationChannel[],
  times: readonly number[],
  values: readonly number[],
  components: number,
  interpolation: AnimationInterpolation,
  boneIndex: number,
  path: Skeleton2DAnimationPath,
  segmentEasings: (EasingFunction | null)[] | null = null,
): void {
  const track = createAnimationTrack({ components, interpolation, segmentEasings, times: times.slice(), values });
  channels.push(createAnimationChannel(track, createSkeleton2DBoneAnimationTarget(boneIndex, path)));
}

function addDragonBonesRotateChannels(
  channels: AnimationChannel[],
  raw: unknown,
  boneIndex: number,
  frameRate: number,
  diagnostics?: ImportDiagnostic[],
): void {
  const frames = dragonBonesFrames(raw, diagnostics);
  if (frames.length === 0) return;
  const times = dragonBonesFrameTimes(frames, frameRate);
  const interpolation = dragonBonesInterpolation(frames, diagnostics);
  const rotations: number[] = [];
  const shears: number[] = [];
  let skewed = false;
  let previousRotation = 0;
  let previousClockwise = 0;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    let rotation = numberOr(frame.rotate, 0);
    if (times[i] !== 0) {
      if (previousClockwise === 0) {
        rotation = previousRotation + normalizeDegrees(rotation - previousRotation);
      } else {
        if (previousClockwise > 0 ? rotation >= previousRotation : rotation <= previousRotation) {
          previousClockwise = previousClockwise > 0 ? previousClockwise - 1 : previousClockwise + 1;
        }
        rotation += 360 * previousClockwise;
      }
    }
    previousClockwise = numberOr(frame.clockwise, 0) | 0;
    previousRotation = rotation;
    const skew = numberOr(frame.skew, 0);
    if (skew !== 0) skewed = true;
    rotations.push(rotation);
    shears.push(0, skew);
  }
  const easings = buildDragonBonesSegmentEasings(frames);
  const rotationPath = Skeleton2DAnimationPath.Rotation;
  addDragonBonesBoneChannel(channels, times, rotations, 1, interpolation, boneIndex, rotationPath, easings);
  if (skewed) {
    const shearPath = Skeleton2DAnimationPath.Shear;
    addDragonBonesBoneChannel(channels, times, shears, 2, interpolation, boneIndex, shearPath, easings);
  }
}

function addDragonBonesVectorChannel(
  channels: AnimationChannel[],
  raw: unknown,
  boneIndex: number,
  path: Skeleton2DAnimationPath,
  frameRate: number,
  diagnostics?: ImportDiagnostic[],
): void {
  const frames = dragonBonesFrames(raw, diagnostics);
  if (frames.length === 0) return;
  const fallback = path === Skeleton2DAnimationPath.Scale ? 1 : 0;
  const values: number[] = [];
  for (const frame of frames) values.push(numberOr(frame.x, fallback), numberOr(frame.y, fallback));
  addDragonBonesBoneChannel(
    channels,
    dragonBonesFrameTimes(frames, frameRate),
    values,
    2,
    dragonBonesInterpolation(frames, diagnostics),
    boneIndex,
    path,
    buildDragonBonesSegmentEasings(frames),
  );
}

function normalizeDegrees(degrees: number): number {
  const wrapped = (degrees + 180) % 360;
  return wrapped + (wrapped > 0 ? -180 : 180);
}

function parseDragonBonesBoneTimeline(
  channels: AnimationChannel[],
  timeline: Readonly<Record<string, unknown>>,
  boneIndex: number,
  frameRate: number,
  diagnostics?: ImportDiagnostic[],
): void {
  addDragonBonesVectorChannel(
    channels,
    timeline.translateFrame,
    boneIndex,
    Skeleton2DAnimationPath.Translation,
    frameRate,
    diagnostics,
  );
  addDragonBonesRotateChannels(channels, timeline.rotateFrame, boneIndex, frameRate, diagnostics);
  addDragonBonesVectorChannel(
    channels,
    timeline.scaleFrame,
    boneIndex,
    Skeleton2DAnimationPath.Scale,
    frameRate,
    diagnostics,
  );
  skipCrumbDragonBonesGroup(diagnostics, timeline.frame, 'dragonbones.legacy-bone-frame-unsupported');
}
