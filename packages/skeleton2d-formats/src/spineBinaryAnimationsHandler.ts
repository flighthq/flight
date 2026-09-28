import { createAnimationClip } from '@flighthq/animation/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  Skeleton2DImportAnimation,
  SpineBinarySectionContext,
  SpineBinaryTimelineContext,
  SpineBinaryTimelineKind,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, SpineBinaryTimelineKind as TimelineKind } from '@flighthq/types/contract';

import { skipSpineBinaryBoneTimelines } from './spineBinaryBoneTimelineHandler.ts';
import { skipSpineBinaryDrawOrderTimeline } from './spineBinaryDrawOrderTimelineHandler.ts';
import { isSpineBinaryReaderOverrun, readSpineBinaryString, readSpineBinaryVarint } from './spineBinaryReader.ts';
import { getSpineBinaryTimelineHandler } from './spineBinaryRegistry.ts';
import { skipSpineBinarySlotTimelines } from './spineBinarySlotTimelineHandler.ts';
import {
  skipSpineBinaryDeformTimelines,
  skipSpineBinaryEventTimelines,
  skipSpineBinaryIkTimelines,
  skipSpineBinaryPathTimelines,
  skipSpineBinaryTransformTimelines,
} from './spineBinaryStubTimelineHandlers.ts';

export function skipSpineBinaryAnimationsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryAnimations(context, false);
}

export const spineBinaryAnimationsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinaryAnimationsSectionHandler;

function readSpineBinaryAnimationsSection(context: SpineBinarySectionContext): void {
  context.animations.push(...consumeSpineBinaryAnimations(context, true));
}

function consumeSpineBinaryAnimations(
  section: SpineBinarySectionContext,
  dispatchRegisteredTimelines: boolean,
): Skeleton2DImportAnimation[] {
  const animations: Skeleton2DImportAnimation[] = [];
  const count = readSpineBinaryVarint(section.reader);
  const unmodeled = new Map<string, number>();
  const unregistered = new Map<SpineBinaryTimelineKind, number>();
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(section.reader); i++) {
    const name = readSpineBinaryString(section.reader);
    readSpineBinaryVarint(section.reader);
    const timeline: SpineBinaryTimelineContext = {
      channels: [],
      drawOrder: null,
      section,
      unmodeledTimelineCounts: unmodeled,
      unregisteredTimelineCounts: unregistered,
    };
    if (dispatchRegisteredTimelines) {
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Slot, skipSpineBinarySlotTimelines);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Bone, skipSpineBinaryBoneTimelines);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Ik, skipSpineBinaryIkTimelines);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Transform, skipSpineBinaryTransformTimelines);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Path, skipSpineBinaryPathTimelines);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Deform, skipSpineBinaryDeformTimelines);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.DrawOrder, skipSpineBinaryDrawOrderTimeline);
      dispatchSpineBinaryTimeline(timeline, TimelineKind.Event, skipSpineBinaryEventTimelines);
    } else {
      skipSpineBinarySlotTimelines(timeline);
      skipSpineBinaryBoneTimelines(timeline);
      skipSpineBinaryIkTimelines(timeline);
      skipSpineBinaryTransformTimelines(timeline);
      skipSpineBinaryPathTimelines(timeline);
      skipSpineBinaryDeformTimelines(timeline);
      skipSpineBinaryDrawOrderTimeline(timeline);
      skipSpineBinaryEventTimelines(timeline);
    }
    animations.push({
      clip: createAnimationClip(timeline.channels),
      drawOrder: timeline.drawOrder,
      name: name ?? '',
    });
  }
  for (const [kind, total] of unmodeled) {
    reportImportDiagnostic(
      section.diagnostics,
      ImportDiagnosticSeverity.Skip,
      `spine.${kind}-timeline-unsupported`,
      'parseSpineSkeletonBinary',
      { timelines: total },
    );
  }
  if (dispatchRegisteredTimelines) {
    for (const [kind, total] of unregistered) {
      reportImportDiagnostic(
        section.diagnostics,
        ImportDiagnosticSeverity.Skip,
        'spine.binary-timeline-unregistered',
        'parseSpineSkeletonBinaryWithRegistry',
        { timeline: kind, timelines: total },
      );
    }
  }
  return animations;
}

function dispatchSpineBinaryTimeline(
  context: SpineBinaryTimelineContext,
  kind: SpineBinaryTimelineKind,
  skip: (context: SpineBinaryTimelineContext) => void,
): void {
  const handle = getSpineBinaryTimelineHandler(context.section.registry, kind);
  if (handle === null) skip(context);
  else handle(context);
}

export function spineBinaryAnimationsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinaryAnimationsSection(context);
}
