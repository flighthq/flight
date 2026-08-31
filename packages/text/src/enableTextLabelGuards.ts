import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextLabelGuard } from './textLabelLayout';

export function disableTextLabelGuards(): void {
  setTextLabelGuard(null);
}

export function enableTextLabelGuards(): void {
  setTextLabelGuard(warnOnStaleTextLabelContent);
}

function warnOnStaleTextLabelContent(liveString: string, rasterizedString: string): void {
  const livePreview = liveString.length > 40 ? liveString.slice(0, 40) + '...' : liveString;
  const rasterPreview = rasterizedString.length > 40 ? rasterizedString.slice(0, 40) + '...' : rasterizedString;
  logOnce(
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
