import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import { easeCubicBezier } from '@flighthq/easing/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2DBoneAnimationTarget } from '@flighthq/skeleton2d/contract';
import type {
  AnimationChannel,
  ByteReader,
  EasingFunction,
  ImportDiagnostic,
  SpineBinaryTimelineContext,
} from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  ImportDiagnosticSeverity,
  Skeleton2DAnimationPath,
  SpineBinaryTimelineKind as TimelineKind,
} from '@flighthq/types/contract';

import {
  SPINE_BINARY_CURVE_BEZIER,
  SPINE_BINARY_CURVE_EPSILON,
  clampSpineBinaryUnit,
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

export function buildSpineBinarySegmentEasings(
  timeline: { curves: (number[] | null)[]; times: number[]; values: number[] },
  values: number,
  diagnostics?: ImportDiagnostic[],
): (EasingFunction | null)[] | null {
  const easings: (EasingFunction | null)[] = [];
  let curved = false;
  let divergent = 0;
  for (let i = 0; i < timeline.curves.length; i++) {
    const points = timeline.curves[i];
    const span = timeline.times[i + 1] - timeline.times[i];
    if (points === null || span <= 0) {
      easings.push(null);
      continue;
    }
    let winner = -1;
    let widest = 0;
    for (let v = 0; v < values && (v + 1) * 4 <= points.length; v++) {
      const rise = Math.abs(timeline.values[(i + 1) * values + v] - timeline.values[i * values + v]);
      if (rise > widest) {
        widest = rise;
        winner = v;
      }
    }
    const rebase = (v: number): [number, number, number, number] | null => {
      const from = timeline.values[i * values + v];
      const rise = timeline.values[(i + 1) * values + v] - from;
      if (rise === 0) return null;
      return [
        (points[v * 4] - timeline.times[i]) / span,
        (points[v * 4 + 1] - from) / rise,
        (points[v * 4 + 2] - timeline.times[i]) / span,
        (points[v * 4 + 3] - from) / rise,
      ];
    };
    const won = winner < 0 ? null : rebase(winner);
    if (won !== null) {
      for (let v = 0; v < values && (v + 1) * 4 <= points.length; v++) {
        if (v === winner) continue;
        const other = rebase(v);
        if (other === null) continue;
        for (let k = 0; k < 4; k++) {
          if (Math.abs(other[k] - won[k]) > SPINE_BINARY_CURVE_EPSILON) divergent++;
        }
      }
    }
    const chosen = won !== null;
    const x1 = won === null ? 0 : won[0];
    const y1 = won === null ? 0 : won[1];
    const x2 = won === null ? 0 : won[2];
    const y2 = won === null ? 0 : won[3];
    if (!chosen) {
      easings.push(null);
      continue;
    }
    curved = true;
    easings.push(easeCubicBezier(clampSpineBinaryUnit(x1), y1, clampSpineBinaryUnit(x2), y2));
  }
  if (divergent > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.per-component-curve-easing-unsupported',
      'buildSpineBinarySegmentEasings',
      { segments: divergent },
    );
  }
  return curved ? easings : null;
}

export const spineBinaryBoneTimelineReader: (context: SpineBinaryTimelineContext) => void =
  spineBinaryBoneTimelineHandler;

function readSpineBinaryBoneTimelines(context: SpineBinaryTimelineContext): void {
  const reader = context.section.reader;
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) {
    const boneIndex = readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      const ordinal = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
      const kind = ordinal < SPINE_BINARY_BONE_TIMELINES.length ? SPINE_BINARY_BONE_TIMELINES[ordinal] : null;
      if (kind === null) {
        skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
        return;
      }
      const timeline = readSpineBinaryValueTimeline(reader, frameCount, kind.values);
      context.channels.push(buildSpineBinaryBoneChannel(timeline, kind, boneIndex, context.section.diagnostics));
    }
  }
}

export function skipSpineBinaryBoneTimelines(context: SpineBinaryTimelineContext): void {
  const reader = context.section.reader;
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tally(context.unregisteredTimelineCounts, TimelineKind.Bone);
      const ordinal = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
      const kind = ordinal < SPINE_BINARY_BONE_TIMELINES.length ? SPINE_BINARY_BONE_TIMELINES[ordinal] : null;
      if (kind === null) {
        skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
        return;
      }
      skipSpineBinaryCurveFrames(reader, frameCount, kind.values * 4, kind.values);
    }
  }
}

function readSpineBinaryValueTimeline(
  reader: ByteReader,
  frameCount: number,
  values: number,
): { curves: (number[] | null)[]; times: number[]; values: number[] } {
  const times: number[] = [];
  const flat: number[] = [];
  const curves: (number[] | null)[] = [];
  if (frameCount <= 0) return { curves, times, values: flat };
  times.push(readSpineBinaryFloat(reader));
  for (let v = 0; v < values; v++) flat.push(readSpineBinaryFloat(reader));
  for (let frame = 0; frame + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); frame++) {
    times.push(readSpineBinaryFloat(reader));
    for (let v = 0; v < values; v++) flat.push(readSpineBinaryFloat(reader));
    const tag = readSpineBinaryByte(reader);
    if (tag === SPINE_BINARY_CURVE_BEZIER) {
      const points: number[] = [];
      for (let v = 0; v < values * 4; v++) points.push(readSpineBinaryFloat(reader));
      curves.push(points);
    } else {
      curves.push(null);
    }
  }
  return { curves, times, values: flat };
}

function buildSpineBinaryBoneChannel(
  timeline: { curves: (number[] | null)[]; times: number[]; values: number[] },
  kind: (typeof SPINE_BINARY_BONE_TIMELINES)[number],
  boneIndex: number,
  diagnostics?: ImportDiagnostic[],
): AnimationChannel {
  const frames = timeline.times.length;
  const components = kind.values;
  const values = new Array<number>(frames * components);
  for (let f = 0; f < frames * components; f++) values[f] = timeline.values[f];
  const track = createAnimationTrack({
    components,
    interpolation: AnimationInterpolationLinear,
    segmentEasings: buildSpineBinarySegmentEasings(timeline, kind.values, diagnostics),
    times: timeline.times,
    values,
  });
  return createAnimationChannel(track, createSkeleton2DBoneAnimationTarget(boneIndex, kind.path));
}

export function spineBinaryBoneTimelineHandler(context: SpineBinaryTimelineContext): void {
  readSpineBinaryBoneTimelines(context);
}

const SPINE_BINARY_BONE_TIMELINES = [
  { path: Skeleton2DAnimationPath.Rotation, values: 1 },
  { path: Skeleton2DAnimationPath.Translation, values: 2 },
  { path: Skeleton2DAnimationPath.TranslationX, values: 1 },
  { path: Skeleton2DAnimationPath.TranslationY, values: 1 },
  { path: Skeleton2DAnimationPath.Scale, values: 2 },
  { path: Skeleton2DAnimationPath.ScaleX, values: 1 },
  { path: Skeleton2DAnimationPath.ScaleY, values: 1 },
  { path: Skeleton2DAnimationPath.Shear, values: 2 },
  { path: Skeleton2DAnimationPath.ShearX, values: 1 },
  { path: Skeleton2DAnimationPath.ShearY, values: 1 },
] as const;
