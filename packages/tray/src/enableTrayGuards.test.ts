import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { LogEntry, TrayIcon } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disableTrayGuards, enableTrayGuards } from './enableTrayGuards';
import { createTrayIcon, destroyTrayIcon, startTrayIconAnimation } from './tray';

let entries: LogEntry[];

beforeEach(() => {
  clearLogOnceKeys();
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
      lifecycle: (() => {
        const out = allocateEntity<any>();
        out.create = async (tray: TrayIcon) => {
          live.push(tray);
          return { outcome: 'created' as const };
        };
        out.destroy = async (tray: TrayIcon) => {
          live.splice(live.indexOf(tray), 1);
          return { outcome: 'destroyed' as const };
        };
        out.isDestroyed = (tray: TrayIcon) => !live.includes(tray);
        out.list = () => live.slice();
        return finishEntity(out);
      })(),
      image: (() => {
        const out = allocateEntity<any>();
        out.set = async () => {
          return { outcome: 'updated' as const };
        };
        return finishEntity(out);
      })(),
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
