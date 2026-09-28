import type { SpineJsonSectionContext, SpineJsonTimelineContext } from '@flighthq/types/contract';

import { skipCrumbSpineTimelineGroup } from './spineParseHelpers.ts';

export function spineJsonDeformTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbSpineTimelineGroup(context.section.diagnostics, animEntry.deform, 'spine.deform-timeline-unsupported');
}

export const spineJsonDeformTimelineReader = spineJsonDeformTimelineHandler;

export function spineJsonEventsSectionHandler(_context: SpineJsonSectionContext): void {
  // Event definitions are recognized for census but not modeled as parse output.
}

export const spineJsonEventsSectionReader = spineJsonEventsSectionHandler;

export function spineJsonEventTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbSpineTimelineGroup(context.section.diagnostics, animEntry.events, 'spine.event-timeline-unsupported');
}

export const spineJsonEventTimelineReader = spineJsonEventTimelineHandler;

export function spineJsonIkConstraintsSectionHandler(_context: SpineJsonSectionContext): void {
  // IK constraint definitions are recognized for census but not modeled as parse output.
}

export const spineJsonIkConstraintsSectionReader = spineJsonIkConstraintsSectionHandler;

export function spineJsonIkTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbSpineTimelineGroup(context.section.diagnostics, animEntry.ik, 'spine.ik-timeline-unsupported');
}

export const spineJsonIkTimelineReader = spineJsonIkTimelineHandler;

export function spineJsonPathConstraintsSectionHandler(_context: SpineJsonSectionContext): void {
  // Path constraint definitions are recognized for census but not modeled as parse output.
}

export const spineJsonPathConstraintsSectionReader = spineJsonPathConstraintsSectionHandler;

export function spineJsonPathTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbSpineTimelineGroup(context.section.diagnostics, animEntry.path, 'spine.path-timeline-unsupported');
}

export const spineJsonPathTimelineReader = spineJsonPathTimelineHandler;

export function spineJsonTransformConstraintsSectionHandler(_context: SpineJsonSectionContext): void {
  // Transform constraint definitions are recognized for census but not modeled as parse output.
}

export const spineJsonTransformConstraintsSectionReader = spineJsonTransformConstraintsSectionHandler;

export function spineJsonTransformTimelineHandler(
  context: SpineJsonTimelineContext,
  _animName: string,
  animEntry: Readonly<Record<string, unknown>>,
): void {
  skipCrumbSpineTimelineGroup(context.section.diagnostics, animEntry.transform, 'spine.transform-timeline-unsupported');
}

export const spineJsonTransformTimelineReader = spineJsonTransformTimelineHandler;
