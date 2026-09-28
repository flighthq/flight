import type { DragonBonesSectionContext, DragonBonesTimelineContext } from '@flighthq/types/contract';

import { skipCrumbDragonBonesGroup } from './dragonBonesParseHelpers.ts';

export function dragonBonesDeformTimelineHandler(
  context: DragonBonesTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbDragonBonesGroup(context.section.diagnostics, animEntry.ffd, 'dragonbones.deform-timeline-unsupported');
}

export const dragonBonesDeformTimelineReader: (
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void = dragonBonesDeformTimelineHandler;

export function dragonBonesIkConstraintsSectionHandler(context: DragonBonesSectionContext): void {
  skipCrumbDragonBonesGroup(context.diagnostics, context.armature.ik, 'dragonbones.ik-constraint-unsupported');
}

export const dragonBonesIkConstraintsSectionReader: (context: DragonBonesSectionContext) => void =
  dragonBonesIkConstraintsSectionHandler;

export function dragonBonesIkTimelineHandler(
  context: DragonBonesTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbDragonBonesGroup(context.section.diagnostics, animEntry.ik, 'dragonbones.ik-timeline-unsupported');
}

export const dragonBonesIkTimelineReader: (
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void = dragonBonesIkTimelineHandler;

export function dragonBonesZOrderTimelineHandler(
  context: DragonBonesTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbDragonBonesGroup(context.section.diagnostics, animEntry.zOrder, 'dragonbones.zorder-timeline-unsupported');
}

export const dragonBonesZOrderTimelineReader: (
  context: DragonBonesTimelineContext,
  animName: string,
  animEntry: Readonly<Record<string, unknown>>,
) => void = dragonBonesZOrderTimelineHandler;
