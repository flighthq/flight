import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSwfFilterListGuard } from './swfFilter';

export function areSwfGuardsEnabled(): boolean {
  return swfGuardsEnabled;
}

export function disableSwfGuards(): void {
  setSwfFilterListGuard(null);
  swfGuardsEnabled = false;
}

// Installs opt-in reporting for an unknown variable-width filter that forces the importer to stop before
// later filter and blend bytes. The parser's safe stop is unconditional; only this message is optional.
export function enableSwfGuards(): void {
  setSwfFilterListGuard(warnOnUnknownSwfFilter);
  swfGuardsEnabled = true;
}

function warnOnUnknownSwfFilter(filterId: number, filterIndex: number): void {
  logOnce(
    `swf:unknown-filter:${filterId}`,
    LogLevel.Warn,
    {
      filterId,
      filterIndex,
      message:
        'readSwfFilterList: an unknown variable-width filter prevents safe parsing of the remaining filters and trailing blend mode — remove the unsupported filter from the asset before importing it.',
    },
    'swf',
  );
}

let swfGuardsEnabled = false;
