import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { addAudioBusToMixer, createAudioBus, createAudioMixer, setAudioBusGain } from './audioMixer';
import { disableAudioMixerGuards, enableAudioMixerGuards } from './enableAudioMixerGuards';

// The narrowest Web Audio stand-in a mixer + bus needs; the guard under test never touches audio itself.
class MockGainNode {
  gain = { value: 1 };
  connect(): void {}
  disconnect(): void {}
}

class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  createGain(): GainNode {
    return new MockGainNode() as unknown as GainNode;
  }
  createStereoPanner(): StereoPannerNode {
    return { connect() {}, disconnect() {}, pan: { value: 0 } } as unknown as StereoPannerNode;
  }
}

const ctx = new MockAudioContext() as unknown as AudioContext;

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String(data.message);
}

describe('disableAudioMixerGuards', () => {
  it('uninstalls the guard, returning the silent no-op to silence', () => {
    const entries = captureLog(() => {
      enableAudioMixerGuards();
      disableAudioMixerGuards();
      setAudioBusGain(createAudioBus({ name: 'orphan' }), 0.25);
    });
    expect(entries.length).toBe(0);
  });
});

describe('enableAudioMixerGuards', () => {
  it('WARNS that a gain change on an unmixed bus reached no audio node', () => {
    const entries = captureLog(() => {
      enableAudioMixerGuards();
      try {
        // Returns the value it set, which is exactly why the failure is invisible without the guard.
        expect(setAudioBusGain(createAudioBus({ name: 'orphan' }), 0.25)).toBe(0.25);
      } finally {
        disableAudioMixerGuards();
      }
    });
    expect(entries.length).toBe(1);
    expect(messageOf(entries[0])).toContain('addAudioBusToMixer');
  });

  it('stays SILENT for a bus that belongs to a mixer', () => {
    const entries = captureLog(() => {
      enableAudioMixerGuards();
      try {
        const mixer = createAudioMixer(ctx);
        const bus = createAudioBus({ name: 'music' });
        addAudioBusToMixer(mixer, bus);
        setAudioBusGain(bus, 0.5);
      } finally {
        disableAudioMixerGuards();
      }
    });
    expect(entries.length).toBe(0);
  });
});
