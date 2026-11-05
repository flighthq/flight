import { createLogState, createMemoryLogSink, getMemoryLogSinkEntries, setLogLevel } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import * as contract from './contract.ts';
import * as timing from './debugTiming.ts';
import * as root from './index.ts';

describe('generated debug timing exports', () => {
  it('routes every public timing helper through the generated module', () => {
    expect(contract.beginDebugSpan).toBe(timing.beginDebugSpan);
    expect(contract.endDebugSpan).toBe(timing.endDebugSpan);
    expect(contract.markDebugFrame).toBe(timing.markDebugFrame);
    expect(contract.measureDebugSpan).toBe(timing.measureDebugSpan);
    expect(root.beginDebugSpan).toBe(timing.beginDebugSpan);
    expect(root.endDebugSpan).toBe(timing.endDebugSpan);
    expect(root.markDebugFrame).toBe(timing.markDebugFrame);
    expect(root.measureDebugSpan).toBe(timing.measureDebugSpan);
  });

  it('preserves the default null channel and an explicit channel', () => {
    const state = contract.createDebugState();
    const logState = createLogState();
    setLogLevel(logState, LogLevel.Verbose);
    const memory = createMemoryLogSink(4);
    contract.enableDebug(state, logState, { sink: memory.sink });
    let now = 0;
    const clock = () => ++now;

    timing.measureDebugSpan(state, logState, clock, 'default-channel', () => undefined);
    timing.measureDebugSpan(state, logState, clock, 'named-channel', () => undefined, 'profile');

    const entries: LogEntry[] = [];
    getMemoryLogSinkEntries(entries, memory);
    expect(entries.map((entry) => entry.channel)).toEqual([null, 'profile']);
  });

  it('rethrows the original error object after closing the span', () => {
    const state = contract.createDebugState();
    const logState = createLogState();
    setLogLevel(logState, LogLevel.Verbose);
    contract.enableDebug(state, logState, { sink: createMemoryLogSink(2).sink });
    const failure = new Error('nope');
    let now = 0;
    let thrown: unknown;

    try {
      timing.measureDebugSpan(
        state,
        logState,
        () => ++now,
        'boom',
        () => {
          throw failure;
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
  });
});
