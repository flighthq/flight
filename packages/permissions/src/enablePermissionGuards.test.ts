import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { arePermissionGuardsEnabled, disablePermissionGuards, enablePermissionGuards } from './enablePermissionGuards';
import {
  createWebPermissionBackend,
  installPermissionHostBackend,
  requestPermission,
  resetPermissionBackendForTest,
  setPermissionBackend,
} from './permission';

function captureLog(run: () => Promise<void>): Promise<readonly LogEntry[]> {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  return run()
    .then(() => getMemoryLogSinkEntries(sink))
    .finally(() => removeLogSink(sink.sink));
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

afterEach(() => {
  disablePermissionGuards();
  resetPermissionBackendForTest();
  vi.unstubAllGlobals();
});

describe('arePermissionGuardsEnabled', () => {
  it('reports whether diagnostics are installed', () => {
    expect(arePermissionGuardsEnabled()).toBe(false);
    enablePermissionGuards();
    expect(arePermissionGuardsEnabled()).toBe(true);
    disablePermissionGuards();
    expect(arePermissionGuardsEnabled()).toBe(false);
  });
});

describe('disablePermissionGuards', () => {
  it('returns the silent degradation to silence', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
    installPermissionHostBackend(createWebPermissionBackend());
    enablePermissionGuards();
    disablePermissionGuards();

    const entries = await captureLog(async () => {
      await requestPermission('acme.disabled-name');
    });

    expect(entries.length).toBe(0);
  });
});

describe('enablePermissionGuards', () => {
  // logOnce suppresses a key for the whole PROCESS, so the fire and the stays-quiet assertions live in
  // ONE test in order, and every test in this file uses a distinct permission name.
  it('WARNS that a request showed no prompt, then suppresses the repeat', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
    installPermissionHostBackend(createWebPermissionBackend());
    enablePermissionGuards();

    const entries = await captureLog(async () => {
      await requestPermission('acme.no-request-path');
    });
    expect(entries.length).toBe(1);
    // The consequence is the point: a caller waiting on a prompt waits forever.
    expect(messageOf(entries[0])).toContain('NO prompt was shown');
    expect(messageOf(entries[0])).toContain('acme.no-request-path');

    const repeat = await captureLog(async () => {
      await requestPermission('acme.no-request-path');
    });
    expect(repeat.length).toBe(0);
  });

  it('stays SILENT for a name that has a real request path', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'granted' });
    installPermissionHostBackend(createWebPermissionBackend());
    enablePermissionGuards();

    const entries = await captureLog(async () => {
      expect(await requestPermission('notifications')).toBe('granted');
    });

    expect(entries.length).toBe(0);
  });
});
