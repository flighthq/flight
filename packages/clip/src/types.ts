import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { Rectangle } from '@flighthq/geometry/contract';
import type { PathWinding as SharedPathWinding } from '@flighthq/path/contract';

/** A hard geometric clip region, represented as a rectangle or flattened contours. */
export interface ClipRegion extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  rect: Rectangle;
  contours: number[][] | null;
  winding: PathWinding;
  version: number;
}

export interface ClipRegionExplanation {
  conservative: boolean;
  status: ClipRegionStatus;
}

export interface ClipRegionContoursExplanation {
  contourIndex: number;
  coordinateCount: number;
  reason: ClipRegionContoursReason;
}

export type ClipRegionContoursGuard = (
  explanation: Readonly<ClipRegionContoursExplanation>,
  contours: Readonly<ReadonlyArray<ReadonlyArray<number>>>,
) => void;

export type ClipRegionReleaseGuard = (clip: Readonly<ClipRegion>) => void;

export type ClipRegionUseGuard = (clip: Readonly<ClipRegion>) => void;

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
