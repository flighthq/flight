import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { createSkeleton2DSlotAnimationTarget } from '@flighthq/skeleton2d/contract';
import type { AnimationChannel, Attachment2D, DragonBonesTimelineContext } from '@flighthq/types/contract';
import { AnimationInterpolationStep, Skeleton2DSlotAnimationPath } from '@flighthq/types/contract';

import {
  buildDragonBonesSegmentEasings,
  dragonBonesFrameTimes,
  dragonBonesFrames,
  dragonBonesInterpolation,
  numberOr,
} from './dragonBonesParseHelpers.ts';

export function dragonBonesSlotTimelineHandler(
  context: DragonBonesTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  parseDragonBonesSlotTimelines(
    context.channels,
    animEntry.slot,
    context.section.slotOrder,
    context.section.displayTable,
    context.section.frameRate,
    context.unmodeledTimelineCounts,
  );
}

export const dragonBonesSlotTimelineReader: (
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void = dragonBonesSlotTimelineHandler;

function addDragonBonesDisplayChannel(
  channels: AnimationChannel[],
  frames: readonly Readonly<Record<string, unknown>>[],
  slotIndex: number,
  displays: readonly (Attachment2D | null)[],
  frameRate: number,
): void {
  const times = dragonBonesFrameTimes(frames, frameRate);
  const values: number[] = [];
  for (const frame of frames) {
    const index = numberOr(frame.value, numberOr(frame.displayIndex, 0)) | 0;
    values.push(index >= 0 && index < displays.length && displays[index] !== null ? index : -1);
  }
  const track = createAnimationTrack({ components: 1, interpolation: AnimationInterpolationStep, times, values });
  channels.push(
    createAnimationChannel(
      track,
      createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Attachment, displays.slice()),
    ),
  );
}

function addDragonBonesSlotColorChannel(
  channels: AnimationChannel[],
  frames: readonly Readonly<Record<string, unknown>>[],
  slotIndex: number,
  frameRate: number,
): void {
  const times = dragonBonesFrameTimes(frames, frameRate);
  const values: number[] = [];
  for (const frame of frames) {
    const raw = frame.value ?? frame.color;
    const color = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    values.push(colorPercent(color.rM), colorPercent(color.gM), colorPercent(color.bM), colorPercent(color.aM));
  }
  const track = createAnimationTrack({
    components: 4,
    interpolation: dragonBonesInterpolation(frames, undefined),
    segmentEasings: buildDragonBonesSegmentEasings(frames),
    times,
    values,
  });
  channels.push(
    createAnimationChannel(track, createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Color)),
  );
}

function colorPercent(value: unknown): number {
  const percent = numberOr(value, 100) / 100;
  return percent <= 0 ? 0 : percent >= 1 ? 1 : percent;
}

function parseDragonBonesSlotTimelines(
  channels: AnimationChannel[],
  raw: unknown,
  slotOrder: ReadonlyMap<string, number>,
  displayTable: ReadonlyMap<string, readonly (Attachment2D | null)[]>,
  frameRate: number,
  unmodeled: Map<string, number>,
): void {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const timeline = entry as Record<string, unknown>;
    const name = typeof timeline.name === 'string' ? timeline.name : null;
    const slotIndex = name === null ? -1 : (slotOrder.get(name) ?? -1);
    if (slotIndex < 0) {
      unmodeled.set('slot', (unmodeled.get('slot') ?? 0) + 1);
      continue;
    }
    const displayFrames = dragonBonesFrames(timeline.displayFrame ?? timeline.display, undefined);
    if (displayFrames.length > 0) {
      addDragonBonesDisplayChannel(channels, displayFrames, slotIndex, displayTable.get(name ?? '') ?? [], frameRate);
    }
    const colorFrames = dragonBonesFrames(timeline.colorFrame ?? timeline.color, undefined);
    if (colorFrames.length > 0) addDragonBonesSlotColorChannel(channels, colorFrames, slotIndex, frameRate);
  }
}
