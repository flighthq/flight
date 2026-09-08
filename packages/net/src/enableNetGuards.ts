import { logOnce } from '@flighthq/log/contract';
import type { NetGuardNotice } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setNetGuard } from './net';

export function areNetGuardsEnabled(): boolean {
  return _enabled;
}

export function disableNetGuards(): void {
  setNetGuard(null);
  _enabled = false;
}

// Installs opt-in warnings for invalid request descriptors and successful requests whose provider
// ignored a supplied progress signal. Omitting this module sheds the guidance strings and
// @flighthq/log dependency from the transport path.
export function enableNetGuards(): void {
  setNetGuard(warnOnNetMisuse);
  _enabled = true;
}

function warnOnNetMisuse(notice: Readonly<NetGuardNotice>): void {
  const { method, timeoutMs, url } = notice.request;
  let message: string;
  if (notice.reason === 'body-on-get-or-head') {
    message = `sendNetRequest: ${method.toUpperCase()} requests do not carry a body — remove request.body or use a body-bearing method`;
  } else if (notice.reason === 'negative-timeout') {
    message =
      'sendNetRequest: timeoutMs is negative, so the provider cannot schedule a timeout — pass zero or a positive duration';
  } else {
    message =
      'sendNetRequest: the provider completed successfully without emitting the supplied progress signal — use a provider that supports download progress';
  }
  logOnce(
    `net:${notice.operation}:${notice.reason}`,
    LogLevel.Warn,
    { message, method, operation: notice.operation, reason: notice.reason, timeoutMs, url },
    'net',
  );
}

let _enabled = false;
