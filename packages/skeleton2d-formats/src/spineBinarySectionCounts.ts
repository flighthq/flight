import {
  SpineBinarySectionKind as SectionKind,
  SpineBinaryTimelineKind as TimelineKind,
} from '@flighthq/types/contract';

import {
  createSpineBinaryReader,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryByte,
  readSpineBinaryString,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';
import { getSpineBinaryVersion } from './spineBinaryVersion.ts';

/**
 * Counts the records in each section and the timeline families within the animations section of a
 * Spine `.skel` binary, returning `null` when the header is unreadable or the version unsupported.
 *
 * The distinction between null and an empty map is load-bearing: null means the file could not be
 * read at all (an unknown-unknown), while an empty map means the header was valid and the file
 * genuinely carries no content sections — a degenerate but readable export.
 *
 * The walk uses the same reader primitives and field sequence as `parseSpineSkeletonBinaryWithRegistry`,
 * and the same version gate, so a file that is readable here is readable there and vice versa.
 */
export function collectSpineBinarySectionCounts(source: Readonly<Uint8Array>): ReadonlyMap<string, number> | null {
  const version = getSpineBinaryVersion(source);
  if (version === null || !isSupportedCensusVersion(version)) return null;

  const reader = createSpineBinaryReader(source);
  skipSpineBinaryBytes(reader, CENSUS_HASH_BYTES);
  readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader)) return null;
  skipSpineBinaryBytes(reader, CENSUS_BOUNDS_BYTES);
  const nonessential = readSpineBinaryBoolean(reader);
  if (nonessential) {
    skipSpineBinaryBytes(reader, CENSUS_FPS_BYTES);
    readSpineBinaryString(reader);
    readSpineBinaryString(reader);
  }
  skipCensusStringTable(reader);
  if (isSpineBinaryReaderOverrun(reader)) return null;

  const counts = new Map<string, number>();
  const bones = skipCensusBones(reader, nonessential);
  if (bones > 0) counts.set(SectionKind.Bones, bones);
  const slots = skipCensusSlots(reader);
  if (slots > 0) counts.set(SectionKind.Slots, slots);
  const ik = skipCensusIkConstraints(reader);
  if (ik > 0) counts.set(SectionKind.IkConstraints, ik);
  const transform = skipCensusTransformConstraints(reader);
  if (transform > 0) counts.set(SectionKind.TransformConstraints, transform);
  const path = skipCensusPathConstraints(reader);
  if (path > 0) counts.set(SectionKind.PathConstraints, path);
  const skins = skipCensusSkins(reader, nonessential);
  if (skins > 0) counts.set(SectionKind.Skins, skins);
  const events = skipCensusEvents(reader);
  if (events > 0) counts.set(SectionKind.Events, events);
  const animations = skipCensusAnimations(reader, slots, counts);
  if (animations > 0) counts.set(SectionKind.Animations, animations);
  return counts;
}

function isSupportedCensusVersion(version: string): boolean {
  const parts = version.split('.');
  if (parts.length < 2) return false;
  return CENSUS_SUPPORTED_LAYOUTS.includes(`${parts[0]}.${parts[1]}`);
}

function skipCensusStringTable(reader: { offset: number; view: DataView }): void {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) readSpineBinaryString(reader);
}

function skipCensusBones(reader: { offset: number; view: DataView }, nonessential: boolean): number {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryString(reader);
    if (i > 0) readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 32);
    readSpineBinaryVarint(reader);
    readSpineBinaryBoolean(reader);
    if (nonessential) skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
  }
  return count;
}

function skipCensusSlots(reader: { offset: number; view: DataView }): number {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryString(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 8);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
  }
  return count;
}

function skipCensusConstraintHead(reader: { offset: number; view: DataView }): void {
  readSpineBinaryString(reader);
  readSpineBinaryVarint(reader);
  readSpineBinaryBoolean(reader);
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) readSpineBinaryVarint(reader);
}

function skipCensusIkConstraints(reader: { offset: number; view: DataView }): number {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    skipCensusConstraintHead(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 12);
  }
  return count;
}

function skipCensusTransformConstraints(reader: { offset: number; view: DataView }): number {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    skipCensusConstraintHead(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 50);
  }
  return count;
}

function skipCensusPathConstraints(reader: { offset: number; view: DataView }): number {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    skipCensusConstraintHead(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 24);
  }
  return count;
}

function skipCensusSkins(reader: { offset: number; view: DataView }, nonessential: boolean): number {
  const defaultSlots = readSpineBinaryVarint(reader);
  let skinCount = 0;
  if (defaultSlots > 0) {
    skinCount++;
    skipCensusSkinBody(reader, defaultSlots, nonessential);
  }
  const alternates = readSpineBinaryVarint(reader);
  for (let i = 0; i < alternates && !isSpineBinaryReaderOverrun(reader); i++) {
    skinCount++;
    readSpineBinaryVarint(reader);
    for (let list = 0; list < CENSUS_SKIN_REQUIREMENT_LISTS; list++) {
      const required = readSpineBinaryVarint(reader);
      for (let j = 0; j < required && !isSpineBinaryReaderOverrun(reader); j++) readSpineBinaryVarint(reader);
    }
    const slotCount = readSpineBinaryVarint(reader);
    skipCensusSkinBody(reader, slotCount, nonessential);
  }
  return skinCount;
}

function skipCensusSkinBody(
  reader: { offset: number; view: DataView },
  slotCount: number,
  nonessential: boolean,
): void {
  for (let i = 0; i < slotCount && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const entries = readSpineBinaryVarint(reader);
    for (let j = 0; j < entries && !isSpineBinaryReaderOverrun(reader); j++) {
      readSpineBinaryVarint(reader);
      skipCensusAttachment(reader, nonessential);
    }
  }
}

function skipCensusAttachment(reader: { offset: number; view: DataView }, nonessential: boolean): void {
  readSpineBinaryVarint(reader);
  const ordinal = readSpineBinaryByte(reader);
  const type = ordinal < CENSUS_ATTACHMENT_TYPES.length ? CENSUS_ATTACHMENT_TYPES[ordinal] : null;
  if (type === 'region') {
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 32);
    skipCensusSequence(reader);
  } else if (type === 'mesh') {
    skipCensusMesh(reader, nonessential);
  } else if (type === 'boundingbox') {
    skipCensusVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
  } else if (type === 'linkedmesh') {
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryBoolean(reader);
    skipCensusSequence(reader);
    if (nonessential) skipSpineBinaryBytes(reader, 8);
  } else if (type === 'path') {
    skipSpineBinaryBytes(reader, 2);
    const vertexCount = readSpineBinaryVarint(reader);
    skipCensusVertices(reader, vertexCount);
    skipSpineBinaryBytes(reader, Math.floor(vertexCount / 3) * 4);
    if (nonessential) skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
  } else if (type === 'point') {
    skipSpineBinaryBytes(reader, 12);
    if (nonessential) skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
  } else if (type === 'clipping') {
    readSpineBinaryVarint(reader);
    skipCensusVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
  } else {
    skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
  }
}

function skipCensusMesh(reader: { offset: number; view: DataView }, nonessential: boolean): void {
  readSpineBinaryVarint(reader);
  skipSpineBinaryBytes(reader, CENSUS_COLOR_BYTES);
  const vertexCount = readSpineBinaryVarint(reader);
  skipSpineBinaryBytes(reader, vertexCount * 8);
  const triangleCount = readSpineBinaryVarint(reader);
  skipSpineBinaryBytes(reader, triangleCount * 2);
  skipCensusVertices(reader, vertexCount);
  readSpineBinaryVarint(reader);
  skipCensusSequence(reader);
  if (nonessential) {
    const edges = readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, edges * 2 + 8);
  }
}

function skipCensusVertices(reader: { offset: number; view: DataView }, vertexCount: number): void {
  if (!readSpineBinaryBoolean(reader)) {
    skipSpineBinaryBytes(reader, vertexCount * 8);
    return;
  }
  for (let v = 0; v < vertexCount && !isSpineBinaryReaderOverrun(reader); v++) {
    const influences = readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, influences * 16);
  }
}

function skipCensusSequence(reader: { offset: number; view: DataView }): void {
  if (!readSpineBinaryBoolean(reader)) return;
  readSpineBinaryVarint(reader);
  readSpineBinaryVarint(reader);
  readSpineBinaryVarint(reader);
  readSpineBinaryVarint(reader);
}

function skipCensusEvents(reader: { offset: number; view: DataView }): number {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 4);
    readSpineBinaryString(reader);
    if (readSpineBinaryString(reader) !== null) skipSpineBinaryBytes(reader, 8);
  }
  return count;
}

function skipCensusAnimations(
  reader: { offset: number; view: DataView },
  slotCount: number,
  counts: Map<string, number>,
): number {
  const animationCount = readSpineBinaryVarint(reader);
  for (let i = 0; i < animationCount && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryString(reader);
    readSpineBinaryVarint(reader);
    skipCensusSlotTimelines(reader, counts);
    skipCensusBoneTimelines(reader, counts);
    skipCensusIkTimelines(reader, counts);
    skipCensusTransformTimelines(reader, counts);
    skipCensusPathTimelines(reader, counts);
    skipCensusDeformTimelines(reader, counts);
    skipCensusDrawOrderTimeline(reader, slotCount, counts);
    skipCensusEventTimelines(reader, counts);
  }
  return animationCount;
}

function tallyTimeline(counts: Map<string, number>, kind: string): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

function skipCensusSlotTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
  const slots = readSpineBinaryVarint(reader);
  for (let i = 0; i < slots && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tallyTimeline(counts, TimelineKind.Slot);
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      if (type === CENSUS_SLOT_ATTACHMENT) {
        for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
          skipSpineBinaryBytes(reader, 4);
          readSpineBinaryVarint(reader);
        }
        continue;
      }
      readSpineBinaryVarint(reader);
      const channels = CENSUS_SLOT_COLOR_CHANNELS[type] ?? 1;
      skipCensusCurveFrames(reader, frameCount, channels, channels);
    }
  }
}

function skipCensusBoneTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tallyTimeline(counts, TimelineKind.Bone);
      const ordinal = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
      const kind = ordinal < CENSUS_BONE_TIMELINE_VALUES.length ? CENSUS_BONE_TIMELINE_VALUES[ordinal] : null;
      if (kind === null) {
        skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
        return;
      }
      skipCensusCurveFrames(reader, frameCount, kind * 4, kind);
    }
  }
}

function skipCensusIkTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
  const ik = readSpineBinaryVarint(reader);
  for (let i = 0; i < ik && !isSpineBinaryReaderOverrun(reader); i++) {
    tallyTimeline(counts, TimelineKind.Ik);
    readSpineBinaryVarint(reader);
    const frameCount = readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 12);
    for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
      skipSpineBinaryBytes(reader, 3);
      if (f === frameCount - 1) break;
      skipSpineBinaryBytes(reader, 12);
      skipCensusCurveTag(reader, 2);
    }
  }
}

function skipCensusTransformTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
  const transform = readSpineBinaryVarint(reader);
  for (let i = 0; i < transform && !isSpineBinaryReaderOverrun(reader); i++) {
    tallyTimeline(counts, TimelineKind.Transform);
    readSpineBinaryVarint(reader);
    const frameCount = readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipCensusCurveFrames(reader, frameCount, 24, 6);
  }
}

function skipCensusPathTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
  const path = readSpineBinaryVarint(reader);
  for (let i = 0; i < path && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tallyTimeline(counts, TimelineKind.Path);
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
      const values = type === CENSUS_PATH_MIX ? 3 : 1;
      skipCensusCurveFrames(reader, frameCount, values * 4, values);
    }
  }
}

function skipCensusDeformTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
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
        if (type === CENSUS_ATTACHMENT_SEQUENCE) {
          tallyTimeline(counts, TimelineKind.Deform);
          skipSpineBinaryBytes(reader, frameCount * 12);
          continue;
        }
        tallyTimeline(counts, TimelineKind.Deform);
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
          skipCensusCurveTag(reader, 1);
        }
      }
    }
  }
}

function skipCensusDrawOrderTimeline(
  reader: { offset: number; view: DataView },
  slotCount: number,
  counts: Map<string, number>,
): void {
  const frames = readSpineBinaryVarint(reader);
  if (frames > 0) tallyTimeline(counts, TimelineKind.DrawOrder);
  for (let i = 0; i < frames && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryBytes(reader, 4);
    const offsets = readSpineBinaryVarint(reader);
    for (let j = 0; j < offsets && !isSpineBinaryReaderOverrun(reader); j++) {
      readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
    }
  }
}

function skipCensusEventTimelines(reader: { offset: number; view: DataView }, counts: Map<string, number>): void {
  const frames = readSpineBinaryVarint(reader);
  if (frames > 0) tallyTimeline(counts, TimelineKind.Event);
  for (let i = 0; i < frames && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryBytes(reader, 4);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 4);
    if (readSpineBinaryBoolean(reader)) readSpineBinaryString(reader);
  }
}

function skipCensusCurveFrames(
  reader: { offset: number; view: DataView },
  frameCount: number,
  payloadBytes: number,
  curveValues: number,
): void {
  if (frameCount <= 0) return;
  skipSpineBinaryBytes(reader, 4 + payloadBytes);
  for (let f = 0; f + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    skipSpineBinaryBytes(reader, 4 + payloadBytes);
    skipCensusCurveTag(reader, curveValues);
  }
}

function skipCensusCurveTag(reader: { offset: number; view: DataView }, curveValues: number): void {
  if (readSpineBinaryByte(reader) === CENSUS_CURVE_BEZIER) {
    skipSpineBinaryBytes(reader, curveValues * 16);
  }
}

const CENSUS_HASH_BYTES = 8;
const CENSUS_BOUNDS_BYTES = 16;
const CENSUS_FPS_BYTES = 4;
const CENSUS_COLOR_BYTES = 4;
const CENSUS_CURVE_BEZIER = 2;
const CENSUS_SLOT_ATTACHMENT = 0;
const CENSUS_ATTACHMENT_SEQUENCE = 1;
const CENSUS_PATH_MIX = 2;
const CENSUS_SKIN_REQUIREMENT_LISTS = 4;
const CENSUS_SUPPORTED_LAYOUTS: readonly string[] = ['4.1'];

const CENSUS_ATTACHMENT_TYPES = ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping'] as const;
const CENSUS_SLOT_COLOR_CHANNELS = [0, 4, 3, 7, 6, 1] as const;
const CENSUS_BONE_TIMELINE_VALUES = [1, 2, 1, 1, 2, 1, 1, 2, 1, 1] as const;
