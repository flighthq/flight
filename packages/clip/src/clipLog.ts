import { logOnce } from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

export function logClipWarning(logState: LogState, nowMs: number, key: string, message: string): void {
  logOnce(logState, nowMs, key, LogLevel.Warn, { message }, 'clip');
}
