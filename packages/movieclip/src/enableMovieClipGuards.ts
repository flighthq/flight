import { logOnce } from '@flighthq/log/contract';
import type { SpritesheetAnimation, SpritesheetTimelineSourceExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSpritesheetTimelineSourceGuard } from './spritesheetTimelineSource';

export function areMovieClipGuardsEnabled(): boolean {
  return movieClipGuardsEnabled;
}

export function disableMovieClipGuards(): void {
  setSpritesheetTimelineSourceGuard(null);
  movieClipGuardsEnabled = false;
}

// Installs opt-in reporting for authored spritesheet playback semantics that TimelineSource cannot carry.
// The ordinary adapter stays logger-free, and importing neither this module nor @flighthq/log keeps both
// the diagnostic prose and logger outside production bundles.
export function enableMovieClipGuards(): void {
  setSpritesheetTimelineSourceGuard(warnOnUnsupportedSpritesheetTimelineFields);
  movieClipGuardsEnabled = true;
}

function warnOnUnsupportedSpritesheetTimelineFields(
  animation: Readonly<SpritesheetAnimation>,
  explanation: Readonly<SpritesheetTimelineSourceExplanation>,
): void {
  if (explanation.unsupportedFields.length === 0) return;
  logOnce(
    `movieclip:spritesheet-timeline-source:${explanation.unsupportedFields.join(',')}`,
    LogLevel.Warn,
    {
      direction: animation.direction,
      message:
        'createSpritesheetTimelineSource: authored repeat or per-frame timing cannot be represented by TimelineSource and will not control MovieClip playback — call explainSpritesheetTimelineSource(animation), or use playSpritesheetAnimation with a SpritesheetPlayer when those semantics must be preserved.',
      repeatCount: animation.repeatCount,
      unsupportedFields: explanation.unsupportedFields,
    },
    'movieclip',
  );
}

let movieClipGuardsEnabled = false;
