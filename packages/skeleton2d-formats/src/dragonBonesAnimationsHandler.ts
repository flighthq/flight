import { createAnimationClip } from '@flighthq/animation/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { DragonBonesSectionContext, DragonBonesTimelineContext } from '@flighthq/types/contract';
import { DragonBonesTimelineKind, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { numberOr } from './dragonBonesParseHelpers.ts';
import { getDragonBonesTimelineHandler } from './dragonBonesRegistry.ts';

export function dragonBonesAnimationsSectionHandler(context: DragonBonesSectionContext): void {
  const raw = context.armature.animation;
  if (!Array.isArray(raw)) return;
  let blendTrees = 0;
  let totalUnresolvedBones = 0;
  const totalUnmodeledTimelines = new Map<string, number>();
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const animation = entry as Record<string, unknown>;
    if (animation.type === DRAGONBONES_BLEND_TREE_TYPE) blendTrees++;
    const name = typeof animation.name === 'string' ? animation.name : DEFAULT_DRAGONBONES_ANIMATION_NAME;
    const timelineContext: DragonBonesTimelineContext = {
      channels: [],
      section: context,
      unmodeledTimelineCounts: new Map(),
      unresolvedBoneCount: 0,
      unregisteredTimelineCounts: new Map(),
    };
    for (const [jsonKey, timelineKind] of DRAGONBONES_TIMELINE_KEY_MAP) {
      if (animation[jsonKey] === undefined) continue;
      const handler = getDragonBonesTimelineHandler(context.registry, timelineKind);
      if (handler !== null) {
        handler(timelineContext, name, animation);
      } else {
        const prev = timelineContext.unregisteredTimelineCounts.get(timelineKind) ?? 0;
        timelineContext.unregisteredTimelineCounts.set(timelineKind, prev + 1);
      }
    }
    for (const [kind, count] of timelineContext.unregisteredTimelineCounts) {
      reportImportDiagnostic(
        context.diagnostics,
        ImportDiagnosticSeverity.Skip,
        `dragonbones.${kind}-timeline-unregistered`,
        'dragonBonesAnimationsSectionReader',
        { count },
      );
    }
    totalUnresolvedBones += timelineContext.unresolvedBoneCount;
    for (const [kind, count] of timelineContext.unmodeledTimelineCounts) {
      totalUnmodeledTimelines.set(kind, (totalUnmodeledTimelines.get(kind) ?? 0) + count);
    }
    const duration = numberOr(animation.duration, 0) / context.frameRate;
    context.animations.push({
      clip: createAnimationClip(
        timelineContext.channels,
        Number.isFinite(duration) && duration > 0 ? duration : undefined,
      ),
      name,
    });
  }
  if (blendTrees > 0) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.blend-tree-animation-unsupported',
      'parseDragonBonesSkeleton',
      { animations: blendTrees },
    );
  }
  for (const [kind, count] of totalUnmodeledTimelines) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Skip,
      `dragonbones.${kind}-timeline-unsupported`,
      'parseDragonBonesSkeleton',
      { timelines: count },
    );
  }
  if (totalUnresolvedBones > 0) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'dragonbones.animation-bone-unresolved',
      'parseDragonBonesSkeleton',
      { bones: totalUnresolvedBones },
    );
  }
}

export const dragonBonesAnimationsSectionReader: (context: DragonBonesSectionContext) => void =
  dragonBonesAnimationsSectionHandler;

const DEFAULT_DRAGONBONES_ANIMATION_NAME = 'default';

const DRAGONBONES_BLEND_TREE_TYPE = 'tree';

const DRAGONBONES_TIMELINE_KEY_MAP: readonly (readonly [string, string])[] = [
  ['bone', DragonBonesTimelineKind.Bone],
  ['slot', DragonBonesTimelineKind.Slot],
  ['ffd', DragonBonesTimelineKind.Deform],
  ['ik', DragonBonesTimelineKind.Ik],
  ['zOrder', DragonBonesTimelineKind.ZOrder],
];
