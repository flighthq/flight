import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import type { HostNetCapability, LogEntry, MemoryLogSink, NetResponse } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { areNetGuardsEnabled, disableNetGuards, enableNetGuards } from './enableNetGuards.ts';
import { sendNetRequest } from './net.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

function captureLog(run: () => Promise<void>): Promise<readonly LogEntry[]> {
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  return run()
    .then(() => readMemoryLogEntries(sink))
    .finally(() => removeLogSink(logState, sink.sink));
}

function hostOf(sendNetRequestBackend: HostNetCapability['sendNetRequest']): {
  readonly net: { readonly http: HostNetCapability };
} {
  return {
    net: {
      http: { sendNetRequest: sendNetRequestBackend },
    },
  };
}

function stubResponse(): NetResponse {
  return { status: 200, statusText: 'OK', ok: true, headers: {}, body: '', url: 'u' };
}

afterEach(() => {
  disableNetGuards();
});

describe('areNetGuardsEnabled', () => {
  it('reports whether the global guard hook is installed', () => {
    enableNetGuards(logState, () => 0);
    expect(areNetGuardsEnabled()).toBe(true);
    disableNetGuards();
    expect(areNetGuardsEnabled()).toBe(false);
  });
});

describe('disableNetGuards', () => {
  it('restores silent request delegation', async () => {
    enableNetGuards(logState, () => 0);
    disableNetGuards();
    const host = hostOf(async () => stubResponse());
    const entries = await captureLog(async () => {
      await sendNetRequest(host.net.http, { body: 'ignored', method: 'GET', timeoutMs: -1, url: 'u' });
    });
    expect(entries).toEqual([]);
  });
});

describe('enableNetGuards', () => {
  it('warns once for bodyless-method bodies and negative timeouts', async () => {
    enableNetGuards(logState, () => 0);
    const host = hostOf(async () => stubResponse());
    const entries = await captureLog(async () => {
      await sendNetRequest(host.net.http, { body: 'ignored', method: 'GET', timeoutMs: -1, url: 'u' });
      await sendNetRequest(host.net.http, { body: 'ignored again', method: 'HEAD', timeoutMs: -2, url: 'v' });
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => (entry.data as Record<string, unknown>).reason)).toEqual([
      'body-on-get-or-head',
      'negative-timeout',
    ]);
  });

  it('warns when a successful provider ignores a supplied progress signal', async () => {
    enableNetGuards(logState, () => 0);
    const host = hostOf(async () => stubResponse());
    const progress = {
      [EntityRuntimeKey]: undefined,
      data: null,
      emit() {},
    };
    const entries = await captureLog(async () => {
      await sendNetRequest(host.net.http, { method: 'GET', url: 'u' }, { progress });
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'net' });
    expect(entries[0].data).toMatchObject({ reason: 'progress-not-emitted', url: 'u' });
  });

  it('stays silent when the provider emits progress', async () => {
    enableNetGuards(logState, () => 0);
    const progress = {
      [EntityRuntimeKey]: undefined,
      data: null,
      emit() {},
    };
    const host = hostOf(async (_request, options) => {
      options?.progress?.emit({ loaded: 1, phase: 'download', total: 1 });
      return stubResponse();
    });
    const entries = await captureLog(async () => {
      await sendNetRequest(host.net.http, { method: 'GET', url: 'u' }, { progress });
    });
    expect(entries).toEqual([]);
  });
});

function readMemoryLogEntries(handle: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, handle);
  return entries;
}
