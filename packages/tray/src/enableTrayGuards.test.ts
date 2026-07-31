import { setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disableTrayGuards, enableTrayGuards } from './enableTrayGuards';
import { createTrayIcon, setTrayBackend, startTrayIconAnimation, stopTrayIconAnimation } from './tray';

let entries: LogEntry[];

beforeEach(() => {
  vi.useFakeTimers();
  entries = [];
  setLogSink((entry) => entries.push(entry));
  setTrayBackend({
    create: () => 1,
    destroy: () => {},
    getBounds: () => null,
    getCapabilities: () => ({ animation: true, badge: false, bounds: true, contextMenu: true, title: true }),
    getTitle: () => '',
    isDestroyed: () => false,
    listIds: () => [1],
    setContextMenu: () => {},
    setIcon: () => {},
    setPressedIcon: () => {},
    setTitle: () => {},
    setTooltip: () => {},
    subscribe: () => () => {},
  } as never);
});

afterEach(() => {
  disableTrayGuards();
  setTrayBackend(null);
  setLogSink(null);
  vi.useRealTimers();
});

function messages(): string {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? '')).join('\n');
}

describe('disableTrayGuards', () => {
  it('stops the guard inspecting later animations', () => {
    enableTrayGuards();
    disableTrayGuards();
    const tray = createTrayIcon()!;
    startTrayIconAnimation(tray, ['a', 'b'], 0);
    stopTrayIconAnimation(tray);
    expect(messages()).toBe('');
  });
});

describe('enableTrayGuards', () => {
  it('says nothing for a positive interval', () => {
    enableTrayGuards();
    const tray = createTrayIcon()!;
    startTrayIconAnimation(tray, ['a', 'b'], 100);
    stopTrayIconAnimation(tray);
    expect(messages()).toBe('');
  });

  // A non-positive interval does not fail — setInterval simply schedules as fast as the host will run
  // it, so the animation "works" while burning a core. Nothing points at the call that asked for it.
  it('warns when the interval is zero, and still starts the animation', () => {
    enableTrayGuards();
    const tray = createTrayIcon()!;

    const stop = startTrayIconAnimation(tray, ['a', 'b'], 0);

    expect(messages()).toContain('intervalMs is 0');
    // The wording that explains WHY is asserted here rather than in a separate negative-interval test:
    // logOnce suppresses a key for the process, so a second test tripping this key would pass or fail
    // on file order alone.
    expect(messages()).toContain('as fast as the host schedules');
    // Warned, not refused: this is misuse, not an expected failure.
    expect(typeof stop).toBe('function');
    stop();
  });
});
