// Generated from crates/flight-textbidi/src/enable_text_bidi_guards.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { LogLevel, logOnce } from '@flighthq/log/contract';
import type { LogStateRaw } from '@flighthq/log/contract';

import { setTextBidiGuard } from './textBidiGuards.ts';

export function disableTextBidiGuards(): void {
  setTextBidiGuard(null);
}

export function enableTextBidiGuards(logState: LogStateRaw, clock: () => number): void {
  setTextBidiGuard((codepoint) => {
    warnOnCompactTableMiss(logState, clock(), codepoint);
  });
}

function warnOnCompactTableMiss(logState: LogStateRaw, nowMs: number, codepoint: number): void {
  const data: Record<string, unknown> = {};
  data['message'] =
    `resolveBidiLevels: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} is outside the compact bidi-class table and defaulted to L. Pass a full-coverage BidiClassKernel to resolveBidiLevels or getBidiRuns.`;
  logOnce(logState, nowMs, 'textbidi:compact-table-miss', LogLevel.Warn, data, 'textbidi');
}
