import type { SpritesheetAnimation } from './SpritesheetAnimation';

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
