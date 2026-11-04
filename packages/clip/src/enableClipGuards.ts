// Generated from crates/flight-clip/src/enable_clip_guards.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { logClipWarning } from './clipLog.ts';
import { setClipRegionContoursGuard, setClipRegionReleaseGuard, setClipRegionUseGuard } from './clipRegion.ts';
import { getClipRegionContoursReasonString } from './clipRegionStrings.ts';
import type { LogState } from './types.ts';

const DOUBLE_RELEASE_MESSAGE =
  'releaseClipRegion: this region is already in the pool, so it is being released twice. Two later acquireClipRegion calls will hand back the same object and the clips will alias each other. Every acquireClipRegion pairs with exactly one releaseClipRegion, and the region must not be used after release.' as const;

const USE_AFTER_RELEASE_MESSAGE =
  'A released ClipRegion was used while it was still in the pool. Do not retain or access a region after releaseClipRegion; acquire a new region before use.' as const;

export function disableClipGuards(): void {
  setClipRegionContoursGuard(null);
  setClipRegionReleaseGuard(null);
  setClipRegionUseGuard(null);
}

/**
 * Installs the opt-in lifecycle diagnostics. The clock capability is captured now but sampled only
 * if an invalid contour, double release, or use-after-release is actually observed.
 */
export function enableClipGuards(logState: Readonly<LogState>, clock: () => number): void {
  const contourLog = logState;
  const contourClock = clock;
  setClipRegionContoursGuard((explanation, _unused0) => {
    const reason = getClipRegionContoursReasonString(explanation.reason);
    const key = `clip:invalid-contour:${reason}`;
    const message = `createClipRegionFromContours: contour ${explanation.contourIndex} has ${explanation.coordinateCount} coordinates (${reason}). Contours require at least three complete x/y pairs.`;
    logClipWarning(contourLog, contourClock(), key, message);
  });
  const releaseLog = logState;
  const releaseClock = clock;
  setClipRegionReleaseGuard((_unused0) => {
    logClipWarning(releaseLog, releaseClock(), 'clip:double-release', DOUBLE_RELEASE_MESSAGE);
  });
  const useLog = logState;
  setClipRegionUseGuard((_unused0) => {
    logClipWarning(useLog, clock(), 'clip:use-after-release', USE_AFTER_RELEASE_MESSAGE);
  });
}
