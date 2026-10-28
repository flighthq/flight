import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { SocketGuardNotice } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSocketGuard } from './socket.ts';

export function areSocketGuardsEnabled(): boolean {
  return _enabled;
}

export function disableSocketGuards(): void {
  setSocketGuard(null);
  _enabled = false;
}

// Installs opt-in warnings for unsupported socket creation and commands issued after terminal entity
// disposal. Omitting this module sheds the guidance strings and @flighthq/log dependency. Warnings go to
// the caller-owned `logState`, stamped with `clock()` when reported.
export function enableSocketGuards(logState: LogState, clock: () => number): void {
  setSocketGuard((notice) => warnOnSocketMisuse(logState, clock(), notice));
  _enabled = true;
}

function warnOnSocketMisuse(logState: LogState, nowMs: number, notice: Readonly<SocketGuardNotice>): void {
  const url = notice.socket.url;
  const message =
    notice.reason === 'no-connection'
      ? 'createSocket: the host carries no socket capability for this transport, or the capability returned no connection — pass a host whose net.socket supports it'
      : `${notice.operation}: socket is already disposed — call createSocket(...) to create a new socket`;
  logOnce(
    logState,
    nowMs,
    `socket:${notice.operation}:${notice.reason}`,
    LogLevel.Warn,
    { message, operation: notice.operation, reason: notice.reason, url },
    'socket',
  );
}

let _enabled = false;
