import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { HasNetHttp, LogEntry, NetBackend, NetResponse } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { areNetGuardsEnabled, disableNetGuards, enableNetGuards } from './enableNetGuards';
import { sendNetRequest } from './net';

function captureLog(run: () => Promise<void>): Promise<readonly LogEntry[]> {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  return run()
    .then(() => getMemoryLogSinkEntries(sink))
    .finally(() => removeLogSink(sink.sink));
}

function hostOf(sendNetRequestBackend: NetBackend['sendNetRequest']): HasNetHttp {
  return {
    net: {
      http: { [EntityRuntimeKey]: undefined, sendNetRequest: sendNetRequestBackend },
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
    enableNetGuards();
    expect(areNetGuardsEnabled()).toBe(true);
    disableNetGuards();
    expect(areNetGuardsEnabled()).toBe(false);
  });
});

describe('disableNetGuards', () => {
  it('restores silent request delegation', async () => {
    enableNetGuards();
    disableNetGuards();
    const host = hostOf(async () => stubResponse());
    const entries = await captureLog(async () => {
      await sendNetRequest(host, { body: 'ignored', method: 'GET', timeoutMs: -1, url: 'u' });
    });
    expect(entries).toEqual([]);
  });
});

describe('enableNetGuards', () => {
  it('warns once for bodyless-method bodies and negative timeouts', async () => {
    enableNetGuards();
    const host = hostOf(async () => stubResponse());
    const entries = await captureLog(async () => {
      await sendNetRequest(host, { body: 'ignored', method: 'GET', timeoutMs: -1, url: 'u' });
      await sendNetRequest(host, { body: 'ignored again', method: 'HEAD', timeoutMs: -2, url: 'v' });
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => (entry.data as Record<string, unknown>).reason)).toEqual([
      'body-on-get-or-head',
      'negative-timeout',
    ]);
  });

  it('warns when a successful provider ignores a supplied progress signal', async () => {
    enableNetGuards();
    const host = hostOf(async () => stubResponse());
    const progress = {
      [EntityRuntimeKey]: undefined,
      data: null,
      emit() {},
    };
    const entries = await captureLog(async () => {
      await sendNetRequest(host, { method: 'GET', url: 'u' }, { progress });
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'net' });
    expect(entries[0].data).toMatchObject({ reason: 'progress-not-emitted', url: 'u' });
  });

  it('stays silent when the provider emits progress', async () => {
    enableNetGuards();
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
      await sendNetRequest(host, { method: 'GET', url: 'u' }, { progress });
    });
    expect(entries).toEqual([]);
  });
});
