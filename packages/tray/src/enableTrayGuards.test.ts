import { createEntity } from '@flighthq/entity/contract';
import { setLogSink } from '@flighthq/log/contract';
import type { LogEntry, TrayIcon } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disableTrayGuards, enableTrayGuards } from './enableTrayGuards';
import { createTrayIcon, destroyTrayIcon, startTrayIconAnimation } from './tray';

let entries: LogEntry[];

beforeEach(() => {
  vi.useFakeTimers();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableTrayGuards();
  setLogSink(null);
  vi.useRealTimers();
});

function host() {
  const live: TrayIcon[] = [];
  return {
    tray: {
      lifecycle: createEntity({
        async create(tray: TrayIcon) {
          live.push(tray);
          return { outcome: 'created' as const };
        },
        async destroy(tray: TrayIcon) {
          live.splice(live.indexOf(tray), 1);
          return { outcome: 'destroyed' as const };
        },
        isDestroyed: (tray: TrayIcon) => !live.includes(tray),
        list: () => live.slice(),
      }),
      image: createEntity({
        async set() {
          return { outcome: 'updated' as const };
        },
      }),
    },
  };
}

async function tray() {
  const result = await createTrayIcon(host());
  if (result.outcome !== 'created') throw new Error(result.outcome);
  return result.tray;
}

function messages(): string {
  return entries.map((entry) => String((entry.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

describe('disableTrayGuards', () => {
  it('stops inspecting later animations', async () => {
    enableTrayGuards();
    disableTrayGuards();
    const icon = await tray();
    const started = await startTrayIconAnimation(icon, ['a'], 0);
    if (started.outcome === 'started') await started.release.release();
    await destroyTrayIcon(icon);
    expect(messages()).toBe('');
  });
});

describe('enableTrayGuards', () => {
  it('warns without refusing a non-positive interval', async () => {
    enableTrayGuards();
    const icon = await tray();
    const started = await startTrayIconAnimation(icon, ['a'], 0);
    expect(started.outcome).toBe('started');
    expect(messages()).toContain('intervalMs is 0');
    if (started.outcome === 'started') await started.release.release();
  });
});
