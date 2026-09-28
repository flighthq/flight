import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { createSkeleton2DSlotAnimationTarget } from '@flighthq/skeleton2d/contract';
import type {
  AnimationChannel,
  Attachment2D,
  AttachmentSkin2D,
  ByteReader,
  SpineBinaryTimelineContext,
} from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  Skeleton2DSlotAnimationPath,
  SpineBinaryTimelineKind as TimelineKind,
} from '@flighthq/types/contract';

import { buildSpineBinarySegmentEasings } from './spineBinaryBoneTimelineHandler.ts';
import {
  SPINE_BINARY_CURVE_BEZIER,
  SPINE_BINARY_DEFAULT_SKIN_NAME,
  SPINE_BINARY_NO_ATTACHMENT_INDEX,
  SPINE_BINARY_SLOT_ATTACHMENT,
  SPINE_BINARY_SLOT_RGBA,
  readSpineBinaryStringReference,
  skipSpineBinaryCurveFrames,
  tally,
} from './spineBinaryParseHelpers.ts';
import {
  isSpineBinaryReaderOverrun,
  readSpineBinaryByte,
  readSpineBinaryFloat,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';

export function skipSpineBinarySlotTimelines(context: SpineBinaryTimelineContext): void {
  const reader = context.section.reader;
  const slots = readSpineBinaryVarint(reader);
  for (let i = 0; i < slots && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tally(context.unregisteredTimelineCounts, TimelineKind.Slot);
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      if (type === SPINE_BINARY_SLOT_ATTACHMENT) {
        for (let frame = 0; frame < frameCount && !isSpineBinaryReaderOverrun(reader); frame++) {
          skipSpineBinaryBytes(reader, 4);
          readSpineBinaryVarint(reader);
        }
        continue;
      }
      readSpineBinaryVarint(reader);
      const channels = SPINE_BINARY_SLOT_COLOR_CHANNELS[type] ?? 1;
      skipSpineBinaryCurveFrames(reader, frameCount, channels, channels);
    }
  }
}

export const spineBinarySlotTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinarySlotTimelineHandler;

function readSpineBinarySlotTimelines(context: SpineBinaryTimelineContext): void {
  const { reader, strings } = context.section;
  const setup = context.section.skins.find((skin) => skin.name === SPINE_BINARY_DEFAULT_SKIN_NAME);
  const slots = readSpineBinaryVarint(reader);
  for (let i = 0; i < slots && !isSpineBinaryReaderOverrun(reader); i++) {
    const slotIndex = readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      if (type === SPINE_BINARY_SLOT_ATTACHMENT) {
        addSpineBinaryAttachmentChannel(reader, context.channels, strings, setup, slotIndex, frameCount);
        continue;
      }
      readSpineBinaryVarint(reader);
      const count = SPINE_BINARY_SLOT_COLOR_CHANNELS[type] ?? 1;
      if (type !== SPINE_BINARY_SLOT_RGBA) {
        tally(context.unmodeledTimelineCounts, 'slot-color');
        skipSpineBinaryCurveFrames(reader, frameCount, count, count);
        continue;
      }
      const timeline = readSpineBinaryColorTimeline(reader, frameCount, count);
      const track = createAnimationTrack({
        components: count,
        interpolation: AnimationInterpolationLinear,
        segmentEasings: buildSpineBinarySegmentEasings(timeline, count, context.section.diagnostics),
        times: timeline.times,
        values: timeline.values,
      });
      context.channels.push(
        createAnimationChannel(
          track,
          createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Color),
        ),
      );
    }
  }
}

export function spineBinarySlotTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinarySlotTimelines(context);
}

function addSpineBinaryAttachmentChannel(
  reader: ByteReader,
  channels: AnimationChannel[],
  strings: readonly (string | null)[],
  setup: Readonly<AttachmentSkin2D> | undefined,
  slotIndex: number,
  frameCount: number,
): void {
  const attachments: (Attachment2D | null)[] = [];
  const indexByName = new Map<string, number>();
  const times: number[] = [];
  const values: number[] = [];
  for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    times.push(readSpineBinaryFloat(reader));
    const name = readSpineBinaryStringReference(reader, strings);
    if (name === null) {
      values.push(SPINE_BINARY_NO_ATTACHMENT_INDEX);
      continue;
    }
    let index = indexByName.get(name);
    if (index === undefined) {
      const found = setup?.attachments.find((entry) => entry.slotIndex === slotIndex && entry.name === name);
      index = found === undefined ? SPINE_BINARY_NO_ATTACHMENT_INDEX : attachments.push(found.attachment) - 1;
      indexByName.set(name, index);
    }
    values.push(index);
  }
  if (times.length === 0) return;
  const track = createAnimationTrack({
    components: 1,
    interpolation: AnimationInterpolationStep,
    times,
    values,
  });
  channels.push(
    createAnimationChannel(
      track,
      createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Attachment, attachments),
    ),
  );
}

function readSpineBinaryColorTimeline(
  reader: ByteReader,
  frameCount: number,
  channelCount: number,
): { curves: (number[] | null)[]; times: number[]; values: number[] } {
  const times: number[] = [];
  const values: number[] = [];
  const curves: (number[] | null)[] = [];
  if (frameCount <= 0) return { curves, times, values };
  times.push(readSpineBinaryFloat(reader));
  for (let c = 0; c < channelCount; c++) values.push(readSpineBinaryByte(reader) / 255);
  for (let f = 0; f + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    times.push(readSpineBinaryFloat(reader));
    for (let c = 0; c < channelCount; c++) values.push(readSpineBinaryByte(reader) / 255);
    const tag = readSpineBinaryByte(reader);
    if (tag === SPINE_BINARY_CURVE_BEZIER) {
      const points: number[] = [];
      for (let v = 0; v < channelCount * 4; v++) points.push(readSpineBinaryFloat(reader));
      curves.push(points);
    } else {
      curves.push(null);
    }
  }
  return { curves, times, values };
}

const SPINE_BINARY_SLOT_COLOR_CHANNELS = [0, 4, 3, 7, 6, 1] as const;
