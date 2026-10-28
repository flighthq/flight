import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { LogState } from '@flighthq/log/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import type { LogEntry, TrayIcon } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disableTrayGuards, enableTrayGuards } from './enableTrayGuards.ts';
import { createTrayIcon, destroyTrayIcon, startTrayIconAnimation } from './tray.ts';

let entries: LogEntry[];
let logState: LogState;

beforeEach(() => {
  vi.useFakeTimers();
  entries = [];
  logState = createLogState();
  setLogSink(logState, (entry) => entries.push(entry));
});

afterEach(() => {
  disableTrayGuards();
  setLogSink(logState, null);
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
  const providers = host();
  const result = await createTrayIcon(providers.tray.lifecycle);
  if (result.outcome !== 'created') throw new Error(result.outcome);
  return { icon: result.tray, image: providers.tray.image };
}

function messages(): string {
  return entries.map((entry) => String((entry.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

describe('disableTrayGuards', () => {
  it('stops inspecting later animations', async () => {
    enableTrayGuards(logState, () => 0);
    disableTrayGuards();
    const { icon, image } = await tray();
    const started = await startTrayIconAnimation(image, icon, ['a'], 0);
    if (started.outcome === 'started') await started.release.release();
    await destroyTrayIcon(icon);
    expect(messages()).toBe('');
  });
});

describe('enableTrayGuards', () => {
  it('warns without refusing a non-positive interval', async () => {
    enableTrayGuards(logState, () => 0);
    const { icon, image } = await tray();
    const started = await startTrayIconAnimation(image, icon, ['a'], 0);
    expect(started.outcome).toBe('started');
    expect(messages()).toContain('intervalMs is 0');
    if (started.outcome === 'started') await started.release.release();
  });
});
