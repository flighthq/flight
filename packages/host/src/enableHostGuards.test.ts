import type { LogState } from '@flighthq/log/contract';
import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { EntityWithoutRuntime, Host, LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { enableHostGuards } from './enableHostGuards.ts';
import { createHost } from './host.ts';

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  logState = createLogState();
});

describe('enableHostGuards', () => {
  it('warns once per commonly needed capability a host is missing', () => {
    const entries = captureLog(() => enableHostGuards(logState, 0, createHost()));

    expect(entries.length).toBe(GUARDED_SLOTS.length);
    expect(entries.every((entry) => entry.level === LogLevel.Warn)).toBe(true);
    expect(entries.map((entry) => slotOf(entry)).sort()).toEqual(GUARDED_SLOTS.slice().sort());
  });

  it('stays silent about a capability the host actually carries', () => {
    const entries = captureLog(() => enableHostGuards(logState, 0, hostWith({ video: { playback: CAPABILITY } })));

    expect(entries.map((entry) => slotOf(entry))).not.toContain('video.playback');
    expect(entries.length).toBe(GUARDED_SLOTS.length - 1);
  });

  it('says nothing at all when every guarded capability is present', () => {
    const entries = captureLog(() =>
      enableHostGuards(
        logState,
        0,
        hostWith({
          audio: { device: CAPABILITY, mixer: CAPABILITY },
          image: { loader: CAPABILITY },
          input: { ingress: CAPABILITY },
          textSegment: { segmenter: CAPABILITY },
          textShaper: { shaper: CAPABILITY },
          video: { playback: CAPABILITY },
        }),
      ),
    );

    expect(entries).toEqual([]);
  });

  it('warns once across hosts, because the logOnce key is the slot rather than the host', () => {
    const entries = captureLog(() => {
      enableHostGuards(logState, 0, createHost());
      enableHostGuards(logState, 0, createHost());
    });

    expect(entries.length).toBe(GUARDED_SLOTS.length);
  });

  it('carries the remedy and its backends as structured data, not only as prose', () => {
    const entries = captureLog(() => enableHostGuards(logState, 0, createHost()));
    const video = entries.find((entry) => slotOf(entry) === 'video.playback');
    const data = video?.data as Readonly<Record<string, unknown>>;

    expect(data.group).toBe('video');
    expect(data.capability).toBe('HostVideoCapability');
    expect(data.backends).toEqual(['webHost (@flighthq/host-web)']);
    expect(String(data.message)).toContain('getHostVideo');
  });
});

const CAPABILITY = {};

// Group-qualified, because slot names are scoped by their group and repeat across the flat structure.
const GUARDED_SLOTS = [
  'audio.device',
  'audio.mixer',
  'image.loader',
  'input.ingress',
  'textSegment.segmenter',
  'textShaper.shaper',
  'video.playback',
];

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(32);
  addLogSink(logState, sink.sink);
  try {
    run();
    return readLogEntries(sink);
  } finally {
    removeLogSink(logState, sink.sink);
  }
}

function hostWith(groups: Readonly<Record<string, Readonly<Record<string, unknown>>>>): Host {
  // A capability literal built from plain stand-ins cannot satisfy createHost's generic, so the shape is
  // asserted. Only the presence of a slot value matters to the guard.
  return createHost(groups as Partial<EntityWithoutRuntime<Host>>);
}

function slotOf(entry: Readonly<LogEntry>): string {
  const data = entry.data as Readonly<Record<string, unknown>>;
  return `${String(data.group)}.${String(data.slot)}`;
}

let logState: LogState = createLogState();
