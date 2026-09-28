import type { ByteReader, SpineBinaryTimelineContext } from '@flighthq/types/contract';
import { SpineBinaryTimelineKind as TimelineKind } from '@flighthq/types/contract';

import {
  SPINE_BINARY_ATTACHMENT_SEQUENCE,
  SPINE_BINARY_PATH_MIX,
  skipSpineBinaryCurveFrames,
  skipSpineBinaryCurveTag,
  tally,
} from './spineBinaryParseHelpers.ts';
import {
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryByte,
  readSpineBinaryString,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';

export function skipSpineBinaryDeformTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryDeformTimelines(
    context.section.reader,
    context.unregisteredTimelineCounts,
    TimelineKind.Deform,
    TimelineKind.Deform,
  );
}

export const spineBinaryDeformTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinaryDeformTimelineHandler;

export function skipSpineBinaryEventTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryEventTimelines(context.section.reader, context.unregisteredTimelineCounts, TimelineKind.Event);
}

export const spineBinaryEventTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinaryEventTimelineHandler;

export function skipSpineBinaryIkTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryIkTimelines(context.section.reader, context.unregisteredTimelineCounts, TimelineKind.Ik);
}

export const spineBinaryIkTimelineReader: (context: SpineBinaryTimelineContext) => void = spineBinaryIkTimelineHandler;

export function skipSpineBinaryPathTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryPathTimelines(context.section.reader, context.unregisteredTimelineCounts, TimelineKind.Path);
}

export const spineBinaryPathTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinaryPathTimelineHandler;

export function skipSpineBinaryTransformTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryTransformTimelines(
    context.section.reader,
    context.unregisteredTimelineCounts,
    TimelineKind.Transform,
  );
}

export const spineBinaryTransformTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinaryTransformTimelineHandler;

function readSpineBinaryIkTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryIkTimelines(context.section.reader, context.unmodeledTimelineCounts, 'ik');
}

function readSpineBinaryPathTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryPathTimelines(context.section.reader, context.unmodeledTimelineCounts, 'path');
}

function readSpineBinaryTransformTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryTransformTimelines(context.section.reader, context.unmodeledTimelineCounts, 'transform');
}

function readSpineBinaryDeformTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryDeformTimelines(
    context.section.reader,
    context.unmodeledTimelineCounts,
    'deform',
    'attachment-sequence',
  );
}

function readSpineBinaryEventTimelines(context: SpineBinaryTimelineContext): void {
  consumeSpineBinaryEventTimelines(context.section.reader, context.unmodeledTimelineCounts, 'event');
}

export function spineBinaryDeformTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryDeformTimelines(context);
}

export function spineBinaryEventTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryEventTimelines(context);
}

export function spineBinaryIkTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryIkTimelines(context);
}

export function spineBinaryPathTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryPathTimelines(context);
}

export function spineBinaryTransformTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryTransformTimelines(context);
}

function consumeSpineBinaryIkTimelines(reader: ByteReader, counts: Map<string, number>, tallyKind: string): void {
  const ik = readSpineBinaryVarint(reader);
  for (let i = 0; i < ik && !isSpineBinaryReaderOverrun(reader); i++) {
    tally(counts, tallyKind);
    readSpineBinaryVarint(reader);
    const frameCount = readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 12);
    for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
      skipSpineBinaryBytes(reader, 3);
      if (f === frameCount - 1) break;
      skipSpineBinaryBytes(reader, 12);
      skipSpineBinaryCurveTag(reader, 2);
    }
  }
}

function consumeSpineBinaryTransformTimelines(
  reader: ByteReader,
  counts: Map<string, number>,
  tallyKind: string,
): void {
  const transform = readSpineBinaryVarint(reader);
  for (let i = 0; i < transform && !isSpineBinaryReaderOverrun(reader); i++) {
    tally(counts, tallyKind);
    readSpineBinaryVarint(reader);
    const frameCount = readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryCurveFrames(reader, frameCount, 24, 6);
  }
}

function consumeSpineBinaryPathTimelines(reader: ByteReader, counts: Map<string, number>, tallyKind: string): void {
  const path = readSpineBinaryVarint(reader);
  for (let i = 0; i < path && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tally(counts, tallyKind);
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
      const values = type === SPINE_BINARY_PATH_MIX ? 3 : 1;
      skipSpineBinaryCurveFrames(reader, frameCount, values * 4, values);
    }
  }
}

function consumeSpineBinaryDeformTimelines(
  reader: ByteReader,
  counts: Map<string, number>,
  deformKind: string,
  sequenceKind: string,
): void {
  const skins = readSpineBinaryVarint(reader);
  for (let i = 0; i < skins && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const slots = readSpineBinaryVarint(reader);
    for (let j = 0; j < slots && !isSpineBinaryReaderOverrun(reader); j++) {
      readSpineBinaryVarint(reader);
      const attachments = readSpineBinaryVarint(reader);
      for (let k = 0; k < attachments && !isSpineBinaryReaderOverrun(reader); k++) {
        readSpineBinaryVarint(reader);
        const type = readSpineBinaryByte(reader);
        const frameCount = readSpineBinaryVarint(reader);
        if (type === SPINE_BINARY_ATTACHMENT_SEQUENCE) {
          tally(counts, sequenceKind);
          skipSpineBinaryBytes(reader, frameCount * 12);
          continue;
        }
        tally(counts, deformKind);
        readSpineBinaryVarint(reader);
        skipSpineBinaryBytes(reader, 4);
        for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
          const run = readSpineBinaryVarint(reader);
          if (run !== 0) {
            readSpineBinaryVarint(reader);
            skipSpineBinaryBytes(reader, run * 4);
          }
          if (f === frameCount - 1) break;
          skipSpineBinaryBytes(reader, 4);
          skipSpineBinaryCurveTag(reader, 1);
        }
      }
    }
  }
}

function consumeSpineBinaryEventTimelines(reader: ByteReader, counts: Map<string, number>, tallyKind: string): void {
  const frames = readSpineBinaryVarint(reader);
  if (frames > 0) tally(counts, tallyKind);
  for (let i = 0; i < frames && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryBytes(reader, 4);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 4);
    if (readSpineBinaryBoolean(reader)) readSpineBinaryString(reader);
  }
}
