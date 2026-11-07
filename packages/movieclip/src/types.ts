// Movieclip-owned contracts. The header lane depends directly on the scene2d, spritesheet, and timeline
// owners.

import type { Node2D, Node2DData, Node2DRuntime } from '@flighthq/scene2d/contract';
import type { SpritesheetAnimation } from '@flighthq/spritesheet/contract';
import type { Timeline, TimelineSignals } from '@flighthq/timeline/contract';

export interface MovieClipData extends Node2DData {
  timeline: Timeline | null;
}

export interface MovieClipRuntime extends Node2DRuntime {
  movieClipSignals: MovieClipSignals | null;
}

export interface MovieClip extends Node2D {
  data: MovieClipData;
}

export const MovieClipKind = 'MovieClip';

// A MovieClip's per-frame lifecycle signals are exactly its timeline's signals — enableMovieClipSignals
// arms the underlying timeline and exposes the same group on the clip's runtime.
export type MovieClipSignals = TimelineSignals;

// Authored SpritesheetAnimation fields that a TimelineSource cannot carry. Direction is absent because
// createSpritesheetTimelineSource materializes it into the source's frame sequence without loss.
export type SpritesheetTimelineSourceUnsupportedField = 'frameDurations' | 'repeatCount';

// Plain-data answer to which animation semantics createSpritesheetTimelineSource cannot preserve. The
// source still carries the animation's frame content, uniform frame duration, origin, and direction.
export interface SpritesheetTimelineSourceExplanation {
  readonly directionMaterialized: true;
  readonly unsupportedFields: readonly SpritesheetTimelineSourceUnsupportedField[];
}

// Nullable diagnostics hook installed by enableMovieClipGuards. The production default is null, so the
// message text and @flighthq/log remain outside the ordinary spritesheet-to-timeline import graph.
export type SpritesheetTimelineSourceGuard = (
  animation: Readonly<SpritesheetAnimation>,
  explanation: Readonly<SpritesheetTimelineSourceExplanation>,
) => void;
