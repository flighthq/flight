import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextBidiGuard } from './textBidiGuards';

/** Uninstalls the guard installed by enableTextBidiGuards. */
export function disableTextBidiGuards(): void {
  setTextBidiGuard(null);
}

/** Installs an opt-in warning for code points outside the bundled compact class table. */
export function enableTextBidiGuards(): void {
  setTextBidiGuard(warnOnCompactTableMiss);
}

function warnOnCompactTableMiss(codepoint: number): void {
  logOnce(
    'textbidi:compact-table-miss',
    LogLevel.Warn,
    {
      message: `resolveBidiLevels: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} is outside the compact bidi-class table and defaulted to L. Install a full-coverage provider with setBidiClassBackend(backend), or pass the provider directly to resolveBidiLevels.`,
    },
    'textbidi',
  );
}
