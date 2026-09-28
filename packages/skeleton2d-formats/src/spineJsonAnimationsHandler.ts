import { createAnimationClip } from '@flighthq/animation/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { SpineJsonSectionContext, SpineJsonTimelineContext } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, SpineJsonTimelineKind } from '@flighthq/types/contract';

import { getSpineJsonTimelineHandler } from './spineJsonRegistry.ts';

export function spineJsonAnimationsSectionHandler(context: SpineJsonSectionContext): void {
  const raw = context.doc.animations;
  if (raw === null || typeof raw !== 'object') return;
  for (const [name, animEntry] of Object.entries(raw as Record<string, unknown>)) {
    if (animEntry === null || typeof animEntry !== 'object') continue;
    const anim = animEntry as Record<string, unknown>;
    const timelineContext: SpineJsonTimelineContext = {
      channels: [],
      drawOrder: null,
      section: context,
      unregisteredTimelineCounts: new Map(),
      unmodeledTimelineCounts: new Map(),
    };
    for (const [jsonKey, timelineKind] of SPINE_JSON_TIMELINE_KEY_MAP) {
      if (anim[jsonKey] === undefined) continue;
      const handler = getSpineJsonTimelineHandler(context.registry, timelineKind);
      if (handler !== null) {
        handler(timelineContext, name, anim);
      } else {
        const prev = timelineContext.unregisteredTimelineCounts.get(timelineKind) ?? 0;
        timelineContext.unregisteredTimelineCounts.set(timelineKind, prev + 1);
      }
    }
    for (const [kind, count] of timelineContext.unregisteredTimelineCounts) {
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Skip,
        `spine.${kind}-timeline-unregistered`,
        'spineJsonAnimationsSectionReader',
        { count },
      );
    }
    context.animations.push({
      clip: createAnimationClip(timelineContext.channels),
      drawOrder: timelineContext.drawOrder,
      name,
    });
  }
}

export const spineJsonAnimationsSectionReader = spineJsonAnimationsSectionHandler;

const SPINE_JSON_TIMELINE_KEY_MAP: readonly (readonly [string, string])[] = [
  ['bones', SpineJsonTimelineKind.Bone],
  ['slots', SpineJsonTimelineKind.Slot],
  ['deform', SpineJsonTimelineKind.Deform],
  ['drawOrder', SpineJsonTimelineKind.DrawOrder],
  ['draworder', SpineJsonTimelineKind.DrawOrder],
  ['events', SpineJsonTimelineKind.Event],
  ['ik', SpineJsonTimelineKind.Ik],
  ['path', SpineJsonTimelineKind.Path],
  ['transform', SpineJsonTimelineKind.Transform],
];
