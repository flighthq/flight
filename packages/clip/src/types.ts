import type { LogState as SharedLogState } from '@flighthq/log/contract';
import type {
  ClipRegion as SharedClipRegion,
  ClipRegionContoursExplanation as SharedClipRegionContoursExplanation,
  ClipRegionContoursGuard as SharedClipRegionContoursGuard,
  ClipRegionExplanation as SharedClipRegionExplanation,
  ClipRegionReleaseGuard as SharedClipRegionReleaseGuard,
  ClipRegionUseGuard as SharedClipRegionUseGuard,
  PathWinding as SharedPathWinding,
} from '@flighthq/types/contract';

export type ClipRegion = SharedClipRegion;
export type ClipRegionContoursExplanation = SharedClipRegionContoursExplanation;
export type ClipRegionContoursGuard = SharedClipRegionContoursGuard;
export type ClipRegionExplanation = SharedClipRegionExplanation;
export type ClipRegionReleaseGuard = SharedClipRegionReleaseGuard;
export type ClipRegionUseGuard = SharedClipRegionUseGuard;
export type LogState = SharedLogState;

export const PathWinding = {
  EvenOdd: 'evenOdd',
  NonZero: 'nonZero',
} as const;

export type PathWinding = SharedPathWinding;

export const ClipRegionStatus = {
  Active: 'active',
  Released: 'released',
} as const;

export type ClipRegionStatus = (typeof ClipRegionStatus)[keyof typeof ClipRegionStatus];

export const ClipRegionContoursReason = {
  OddCoordinateCount: 'odd-coordinate-count',
  TooFewPoints: 'too-few-points',
} as const;

export type ClipRegionContoursReason = (typeof ClipRegionContoursReason)[keyof typeof ClipRegionContoursReason];
