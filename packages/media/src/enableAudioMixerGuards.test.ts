import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type {
  AudioBusNodeHandle,
  AudioDeviceHandle,
  AudioMixerGraphHandle,
  HostAudioMixerCapability,
  LogEntry,
} from '@flighthq/types/contract';

import { addAudioBusToMixer, createAudioBus, createAudioMixer, setAudioBusGain } from './audioMixer';
import { disableAudioMixerGuards, enableAudioMixerGuards } from './enableAudioMixerGuards';

const device = 1 as AudioDeviceHandle;
const graph = 1 as AudioMixerGraphHandle;
const busNode = 1 as AudioBusNodeHandle;
const mixerProvider = (() => {
  const out = allocateEntity<HostAudioMixerCapability>();
  out.createMixerGraph = () => graph;
  out.destroyMixerGraph = () => {};
  out.createBusNode = () => busNode;
  out.destroyBusNode = () => {};
  out.setBusNodeGain = () => {};
  out.setBusNodePan = () => {};
  out.fadeBusNodeGain = () => {};
  out.setMasterGain = () => {};
  out.routeSourceToBus = () => {};
  out.unrouteSource = () => {};
  out.routeSourceToDefault = () => {};
  return finishEntity(out);
})();

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
      setAudioBusGain(mixerProvider, createAudioBus({ name: 'orphan' }), 0.25);
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
        expect(setAudioBusGain(mixerProvider, createAudioBus({ name: 'orphan' }), 0.25)).toBe(0.25);
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
        const mixer = createAudioMixer(mixerProvider, device);
        const bus = createAudioBus({ name: 'music' });
        addAudioBusToMixer(mixerProvider, mixer, bus);
        setAudioBusGain(mixerProvider, bus, 0.5);
      } finally {
        disableAudioMixerGuards();
      }
    });
    expect(entries.length).toBe(0);
  });
});
