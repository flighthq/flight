import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { EntityWithoutRuntime, Host, LogEntry } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { enableHostGuards } from './enableHostGuards';
import { createHost } from './host';

beforeEach(() => {
  clearLogOnceKeys();
});

describe('enableHostGuards', () => {
  it('warns once per commonly needed provider a host is missing', () => {
    const entries = captureLog(() => enableHostGuards(createHost()));

    expect(entries.length).toBe(GUARDED_SLOTS.length);
    expect(entries.every((entry) => entry.level === LogLevel.Warn)).toBe(true);
    expect(entries.map((entry) => slotOf(entry)).sort()).toEqual(GUARDED_SLOTS.slice().sort());
  });

  it('stays silent about a provider the host actually carries', () => {
    const entries = captureLog(() => enableHostGuards(hostWith({ media: { video: PROVIDER } })));

    expect(entries.map((entry) => slotOf(entry))).not.toContain('video');
    expect(entries.length).toBe(GUARDED_SLOTS.length - 1);
  });

  it('says nothing at all when every guarded provider is present', () => {
    const entries = captureLog(() =>
      enableHostGuards(
        hostWith({
          graphics: { image: PROVIDER },
          input: { ingress: PROVIDER },
          media: { audioDevice: PROVIDER, audioMixer: PROVIDER, video: PROVIDER },
          text: { segmenter: PROVIDER, shaper: PROVIDER },
        }),
      ),
    );

    expect(entries).toEqual([]);
  });

  it('warns once across hosts, because the logOnce key is the slot rather than the host', () => {
    const entries = captureLog(() => {
      enableHostGuards(createHost());
      enableHostGuards(createHost());
    });

    expect(entries.length).toBe(GUARDED_SLOTS.length);
  });

  it('carries the remedy and its backends as structured data, not only as prose', () => {
    const entries = captureLog(() => enableHostGuards(createHost()));
    const video = entries.find((entry) => slotOf(entry) === 'video');
    const data = video?.data as Readonly<Record<string, unknown>>;

    expect(data.group).toBe('media');
    expect(data.provider).toBe('HostVideoProvider');
    expect(data.backends).toEqual(['webHost (@flighthq/host-web)']);
    expect(String(data.message)).toContain('getHostVideo');
  });
});

const PROVIDER = {};

const GUARDED_SLOTS = ['audioDevice', 'audioMixer', 'image', 'ingress', 'segmenter', 'shaper', 'video'];

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(32);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function hostWith(groups: Readonly<Record<string, Readonly<Record<string, unknown>>>>): Host {
  // A capability literal built from plain stand-ins cannot satisfy createHost's generic, so the shape is
  // asserted. Only the presence of a slot value matters to the guard.
  return createHost(groups as Partial<EntityWithoutRuntime<Host>>);
}

function slotOf(entry: Readonly<LogEntry>): string {
  return String((entry.data as Readonly<Record<string, unknown>>).slot);
}
