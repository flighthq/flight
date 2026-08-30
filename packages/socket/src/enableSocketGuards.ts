import { logOnce } from '@flighthq/log/contract';
import type { SocketGuardNotice } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSocketGuard } from './socket';

export function areSocketGuardsEnabled(): boolean {
  return _enabled;
}

export function disableSocketGuards(): void {
  setSocketGuard(null);
  _enabled = false;
}

// Installs opt-in warnings for unsupported socket creation and commands issued after terminal entity
// disposal. Omitting this module sheds the guidance strings and @flighthq/log dependency.
export function enableSocketGuards(): void {
  setSocketGuard(warnOnSocketMisuse);
  _enabled = true;
}

function warnOnSocketMisuse(notice: Readonly<SocketGuardNotice>): void {
  const url = notice.socket.url;
  const message =
    notice.reason === 'no-connection'
      ? 'createSocket: the host carries no socket provider for this transport, or its provider returned no connection — pass a host whose net.socket supports it'
      : `${notice.operation}: socket is already disposed — call createSocket(...) to create a new socket`;
  logOnce(
    `socket:${notice.operation}:${notice.reason}`,
    LogLevel.Warn,
    { message, operation: notice.operation, reason: notice.reason, url },
    'socket',
  );
}

let _enabled = false;
