import type { LogState } from '@flighthq/log/contract';
import {
  clearLogChannelLevels,
  clearLogSinks,
  createLogState,
  createMemoryLogSink,
  getLogChannelLevel,
  getLogLevel,
  getMemoryLogSinkEntries,
  log,
  setLogChannelLevel,
  setLogLevel,
} from '@flighthq/log/contract';
import {
  areColorAdjustmentGuardsEnabled,
  areRenderRegistriesGuardsEnabled,
  createRenderState,
} from '@flighthq/render/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebugState } from './debug.ts';
import {
  createDebugState,
  disableDebug,
  enableDebug,
  enableFlightDiagnostics,
  isDebugEnabled,
  registerDebugSubsystem,
  unregisterDebugSubsystem,
} from './debug.ts';

// Subsystem names touched by the tests, unregistered between each so the module-global registry
// never leaks state across cases.
const testSubsystemNames = ['render', 'input', 'audio', 'acme.custom'];

function readMemory(sink: MemoryLogSink): readonly unknown[] {
  return readLogEntries(sink);
}

// Monotonic test clock: each read advances one millisecond, so spans measure a positive duration.
function clock(): number {
  return ++clockMs;
}

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  clockMs = 0;
  debugState = createDebugState();
  logState = createLogState();
  if (isDebugEnabled(debugState)) disableDebug(debugState, logState);
  for (const name of testSubsystemNames) unregisterDebugSubsystem(debugState, name);
  clearLogSinks(logState);
  clearLogChannelLevels(logState);
  setLogLevel(logState, LogLevel.Verbose);
});

afterEach(() => {
  if (isDebugEnabled(debugState)) disableDebug(debugState, logState);
  for (const name of testSubsystemNames) unregisterDebugSubsystem(debugState, name);
  clearLogSinks(logState);
  clearLogChannelLevels(logState);
  setLogLevel(logState, LogLevel.Verbose);
});

describe('disableDebug', () => {
  it('removes the installed sink so a later log does not reach it', () => {
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem(debugState, 'render', { channels: ['render'] });
    enableDebug(debugState, logState, { subsystems: ['render'], sink: memory.sink });

    log(logState, 0, LogLevel.Debug, 'before', 'render');
    expect(readMemory(memory)).toHaveLength(1);

    disableDebug(debugState, logState);
    log(logState, 0, LogLevel.Debug, 'after', 'render');
    expect(readMemory(memory)).toHaveLength(1);
  });

  it('runs each enabled subsystem disableGuards binding', () => {
    const disableGuards = vi.fn();
    registerDebugSubsystem(debugState, 'render', { disableGuards });
    enableDebug(debugState, logState, { subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(disableGuards).not.toHaveBeenCalled();
    disableDebug(debugState, logState);
    expect(disableGuards).toHaveBeenCalledTimes(1);
  });

  it('restores the global level and clears the channel overrides it raised', () => {
    setLogLevel(logState, LogLevel.Warn);
    registerDebugSubsystem(debugState, 'render', { channels: ['render'] });
    enableDebug(debugState, logState, {
      subsystems: ['render'],
      level: LogLevel.Verbose,
      sink: createMemoryLogSink(1).sink,
    });

    disableDebug(debugState, logState);
    expect(getLogLevel(logState)).toBe(LogLevel.Warn);
    expect(getLogChannelLevel(logState, 'render')).toBeNull();
  });

  it('preserves channel overrides the caller set before the session', () => {
    setLogChannelLevel(logState, 'unrelated', LogLevel.Error);
    registerDebugSubsystem(debugState, 'render', { channels: ['render'] });
    enableDebug(debugState, logState, { subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(getLogChannelLevel(logState, 'render')).toBe(LogLevel.Debug);

    disableDebug(debugState, logState);
    expect(getLogChannelLevel(logState, 'render')).toBeNull();
    expect(getLogChannelLevel(logState, 'unrelated')).toBe(LogLevel.Error);
  });

  it('restores a pre-existing override on a channel debug also raised', () => {
    setLogChannelLevel(logState, 'render', LogLevel.Warn);
    registerDebugSubsystem(debugState, 'render', { channels: ['render'] });
    enableDebug(debugState, logState, {
      subsystems: ['render'],
      level: LogLevel.Verbose,
      sink: createMemoryLogSink(1).sink,
    });

    expect(getLogChannelLevel(logState, 'render')).toBe(LogLevel.Verbose);

    disableDebug(debugState, logState);
    expect(getLogChannelLevel(logState, 'render')).toBe(LogLevel.Warn);
  });

  it('is a no-op when debug is not enabled', () => {
    expect(isDebugEnabled(debugState)).toBe(false);
    expect(() => disableDebug(debugState, logState)).not.toThrow();
    expect(isDebugEnabled(debugState)).toBe(false);
  });
});

describe('enableDebug', () => {
  it('runs a selected subsystem enableGuards and raises its channel levels', () => {
    const enableGuards = vi.fn();
    registerDebugSubsystem(debugState, 'render', { channels: ['render', 'render.batch'], enableGuards });

    enableDebug(debugState, logState, { subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(enableGuards).toHaveBeenCalledTimes(1);
    expect(getLogChannelLevel(logState, 'render')).toBe(LogLevel.Debug);
    expect(getLogChannelLevel(logState, 'render.batch')).toBe(LogLevel.Debug);
    expect(isDebugEnabled(debugState)).toBe(true);
  });

  it('routes a log on a raised channel to the installed sink', () => {
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem(debugState, 'render', { channels: ['render'] });
    enableDebug(debugState, logState, { subsystems: ['render'], sink: memory.sink });

    log(logState, 0, LogLevel.Debug, { msg: 'draw' }, 'render');
    expect(readMemory(memory)).toHaveLength(1);
  });

  it('honors an explicit level and extra channels', () => {
    registerDebugSubsystem(debugState, 'render', { channels: ['render'] });
    enableDebug(debugState, logState, {
      subsystems: ['render'],
      level: LogLevel.Verbose,
      channels: ['app'],
      sink: createMemoryLogSink(1).sink,
    });

    expect(getLogLevel(logState)).toBe(LogLevel.Verbose);
    expect(getLogChannelLevel(logState, 'render')).toBe(LogLevel.Verbose);
    expect(getLogChannelLevel(logState, 'app')).toBe(LogLevel.Verbose);
  });

  it('enables every registered subsystem when none are named', () => {
    const renderGuards = vi.fn();
    const inputGuards = vi.fn();
    registerDebugSubsystem(debugState, 'render', { enableGuards: renderGuards });
    registerDebugSubsystem(debugState, 'input', { enableGuards: inputGuards });

    enableDebug(debugState, logState, { sink: createMemoryLogSink(1).sink });

    expect(renderGuards).toHaveBeenCalledTimes(1);
    expect(inputGuards).toHaveBeenCalledTimes(1);
  });

  it('skips an unregistered subsystem name without throwing', () => {
    const memory = createMemoryLogSink(1);
    expect(() => enableDebug(debugState, logState, { subsystems: ['audio'], sink: memory.sink })).not.toThrow();
    expect(isDebugEnabled(debugState)).toBe(true);
  });

  it('is idempotent — a second enable while active does not re-run guards or re-install', () => {
    const enableGuards = vi.fn();
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem(debugState, 'render', { channels: ['render'], enableGuards });

    enableDebug(debugState, logState, { subsystems: ['render'], sink: memory.sink });
    enableDebug(debugState, logState, { subsystems: ['render'], sink: memory.sink });

    expect(enableGuards).toHaveBeenCalledTimes(1);
    log(logState, 0, LogLevel.Debug, 'once', 'render');
    expect(readMemory(memory)).toHaveLength(1);
  });

  it('unwinds a partially enabled guard transaction without masking its original error', () => {
    const memory = createMemoryLogSink(16);
    const originalError = new Error('audio guard enable failed');
    const rollbackError = new Error('input guard rollback failed');
    const activeGuards = new Set<string>();
    const rollbackOrder: string[] = [];
    const hooks = (name: string, failEnable = false, failRollback = false) => ({
      channels: [name],
      disableGuards: (): void => {
        activeGuards.delete(name);
        rollbackOrder.push(name);
        if (failRollback) throw rollbackError;
      },
      enableGuards: (): void => {
        activeGuards.add(name);
        if (failEnable) throw originalError;
      },
    });
    registerDebugSubsystem(debugState, 'render', hooks('render'));
    registerDebugSubsystem(debugState, 'input', hooks('input', false, true));
    registerDebugSubsystem(debugState, 'audio', hooks('audio', true));
    setLogLevel(logState, LogLevel.Warn);
    setLogChannelLevel(logState, 'render', LogLevel.Error);
    setLogChannelLevel(logState, 'input', LogLevel.Info);
    setLogChannelLevel(logState, 'unrelated', LogLevel.Verbose);

    let thrown: unknown;
    try {
      enableDebug(debugState, logState, { subsystems: ['render', 'input', 'audio'], sink: memory.sink });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(originalError);
    expect(isDebugEnabled(debugState)).toBe(false);
    expect([...activeGuards]).toEqual([]);
    expect(rollbackOrder).toEqual(['audio', 'input', 'render']);
    expect(getLogLevel(logState)).toBe(LogLevel.Warn);
    expect(getLogChannelLevel(logState, 'render')).toBe(LogLevel.Error);
    expect(getLogChannelLevel(logState, 'input')).toBe(LogLevel.Info);
    expect(getLogChannelLevel(logState, 'audio')).toBeNull();
    expect(getLogChannelLevel(logState, 'unrelated')).toBe(LogLevel.Verbose);
    log(logState, 0, LogLevel.Error, 'after failed enable');
    expect(readMemory(memory)).toEqual([]);
  });
});

describe('enableFlightDiagnostics', () => {
  it('enables the console diagnostics session and every generic render guard for the state', () => {
    const state = createRenderState();
    enableFlightDiagnostics(debugState, logState, state);
    expect(isDebugEnabled(debugState)).toBe(true);
    expect(areColorAdjustmentGuardsEnabled(state)).toBe(true);
    expect(areRenderRegistriesGuardsEnabled(state)).toBe(true);
  });
});

describe('isDebugEnabled', () => {
  it('reports the enable/disable lifecycle', () => {
    expect(isDebugEnabled(debugState)).toBe(false);
    enableDebug(debugState, logState, { sink: createMemoryLogSink(1).sink });
    expect(isDebugEnabled(debugState)).toBe(true);
    disableDebug(debugState, logState);
    expect(isDebugEnabled(debugState)).toBe(false);
  });
});

describe('registerDebugSubsystem', () => {
  it('drives a newly registered subsystem through enableDebug', () => {
    const enableGuards = vi.fn();
    registerDebugSubsystem(debugState, 'acme.custom', { channels: ['acme.custom'], enableGuards });

    enableDebug(debugState, logState, { subsystems: ['acme.custom'], sink: createMemoryLogSink(1).sink });

    expect(enableGuards).toHaveBeenCalledTimes(1);
    expect(getLogChannelLevel(logState, 'acme.custom')).toBe(LogLevel.Debug);
  });

  it('is last-write-wins for a repeated name', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerDebugSubsystem(debugState, 'render', { enableGuards: first });
    registerDebugSubsystem(debugState, 'render', { enableGuards: second });

    enableDebug(debugState, logState, { subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterDebugSubsystem', () => {
  it('returns true and stops the subsystem from being driven', () => {
    const enableGuards = vi.fn();
    registerDebugSubsystem(debugState, 'render', { enableGuards });

    expect(unregisterDebugSubsystem(debugState, 'render')).toBe(true);
    enableDebug(debugState, logState, { subsystems: ['render'], sink: createMemoryLogSink(1).sink });
    expect(enableGuards).not.toHaveBeenCalled();
  });

  it('returns false for a name that was never registered', () => {
    expect(unregisterDebugSubsystem(debugState, 'audio')).toBe(false);
  });
});

let clockMs = 0;
let debugState: DebugState = createDebugState();
let logState: LogState = createLogState();
