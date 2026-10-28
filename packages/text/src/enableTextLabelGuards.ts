import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextLabelGuard } from './textLabelLayout.ts';

export function disableTextLabelGuards(): void {
  setTextLabelGuard(null);
}

export function enableTextLabelGuards(logState: LogState, clock: () => number): void {
  setTextLabelGuard((liveString: string, rasterizedString: string): void =>
    warnOnStaleTextLabelContent(logState, clock(), liveString, rasterizedString),
  );
}

function warnOnStaleTextLabelContent(
  logState: LogState,
  nowMs: number,
  liveString: string,
  rasterizedString: string,
): void {
  const livePreview = liveString.length > 40 ? liveString.slice(0, 40) + '...' : liveString;
  const rasterPreview = rasterizedString.length > 40 ? rasterizedString.slice(0, 40) + '...' : rasterizedString;
  logOnce(
    logState,
    nowMs,
    'text:stale-text-label-content',
    LogLevel.Warn,
    {
      message:
        `TextLabel data.text was mutated directly ("${livePreview}") without calling setTextLabelString, ` +
        `so the content revision was not bumped and renderers still show the previous text ("${rasterPreview}"). ` +
        'Use setTextLabelString(label, text) to update text at runtime.',
    },
    'text',
  );
}
