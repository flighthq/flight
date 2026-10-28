import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { ClipRegion, ClipRegionContoursExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setClipRegionContoursGuard, setClipRegionReleaseGuard, setClipRegionUseGuard } from './clipRegion.ts';

// Uninstalls the guard installed by enableClipGuards.
export function disableClipGuards(): void {
  setClipRegionContoursGuard(null);
  setClipRegionReleaseGuard(null);
  setClipRegionUseGuard(null);
}

// Installs the caller-facing clip guard (opt-in, dev-only). The pooled ClipRegion has one silent footgun:
// releasing the same region twice puts it in the pool twice, so two later acquires hand back the SAME
// object and two unrelated clips alias each other. Nothing throws — the symptom is a clip that is subtly
// wrong somewhere else entirely, which is why a comment saying "every acquire must have a matching
// release" was not enough. The guard warns once through @flighthq/log. Not importing this module costs
// production nothing: the message text and the @flighthq/log dependency live only here, and the O(pool)
// membership scan that detects the double release runs only while this guard is installed. Idempotent.
export function enableClipGuards(logState: LogState, clock: () => number): void {
  setClipRegionContoursGuard((explanation) => warnOnInvalidContours(logState, clock, explanation));
  setClipRegionReleaseGuard((clip) => warnOnDoubleRelease(logState, clock, clip));
  setClipRegionUseGuard((clip) => warnOnUseAfterRelease(logState, clock, clip));
}

function warnOnInvalidContours(
  logState: LogState,
  clock: () => number,
  explanation: Readonly<ClipRegionContoursExplanation>,
): void {
  logOnce(
    logState,
    clock(),
    `clip:invalid-contour:${explanation.reason}`,
    LogLevel.Warn,
    {
      message: `createClipRegionFromContours: contour ${explanation.contourIndex} has ${explanation.coordinateCount} coordinates (${explanation.reason}). Contours require at least three complete x/y pairs.`,
    },
    'clip',
  );
}

function warnOnDoubleRelease(logState: LogState, clock: () => number, _clip: Readonly<ClipRegion>): void {
  logOnce(
    logState,
    clock(),
    'clip:double-release',
    LogLevel.Warn,
    {
      message:
        'releaseClipRegion: this region is already in the pool, so it is being released twice. Two later acquireClipRegion calls will hand back the same object and the clips will alias each other. Every acquireClipRegion pairs with exactly one releaseClipRegion, and the region must not be used after release.',
    },
    'clip',
  );
}

function warnOnUseAfterRelease(logState: LogState, clock: () => number, _clip: Readonly<ClipRegion>): void {
  logOnce(
    logState,
    clock(),
    'clip:use-after-release',
    LogLevel.Warn,
    {
      message:
        'A released ClipRegion was used while it was still in the pool. Do not retain or access a region after releaseClipRegion; acquire a new region before use.',
    },
    'clip',
  );
}
