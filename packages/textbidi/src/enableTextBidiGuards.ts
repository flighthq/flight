import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextBidiGuard } from './textBidiGuards.ts';

/** Uninstalls the guard installed by enableTextBidiGuards. */
export function disableTextBidiGuards(): void {
  setTextBidiGuard(null);
}

/** Installs an opt-in warning for code points outside the bundled compact class table. */
export function enableTextBidiGuards(logState: LogState, clock: () => number): void {
  setTextBidiGuard((codepoint: number): void => warnOnCompactTableMiss(logState, clock(), codepoint));
}

function warnOnCompactTableMiss(logState: LogState, nowMs: number, codepoint: number): void {
  logOnce(
    logState,
    nowMs,
    'textbidi:compact-table-miss',
    LogLevel.Warn,
    {
      message: `resolveBidiLevels: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} is outside the compact bidi-class table and defaulted to L. Pass a full-coverage BidiClassKernel to resolveBidiLevels or getBidiRuns.`,
    },
    'textbidi',
  );
}
