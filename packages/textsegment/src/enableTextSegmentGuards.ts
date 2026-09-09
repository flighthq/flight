import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextSegmentGuard } from './textSegmentGuards';

/** Uninstalls the guard installed by enableTextSegmentGuards. */
export function disableTextSegmentGuards(): void {
  setTextSegmentGuard(null);
}

/** Installs an opt-in warning for use of the bundled provider where Intl.Segmenter is absent. */
export function enableTextSegmentGuards(): void {
  setTextSegmentGuard(warnOnMissingIntlSegmenter);
}

function warnOnMissingIntlSegmenter(): void {
  logOnce(
    'textsegment:intl-segmenter-unavailable',
    LogLevel.Warn,
    {
      message:
        'segmentGraphemes: Intl.Segmenter is unavailable and no replacement provider was supplied, so segmentation returned no results. Install a backend with setTextSegmenterBackend(backend), or pass a HasTextSegmenter host directly to the operation.',
    },
    'textsegment',
  );
}
