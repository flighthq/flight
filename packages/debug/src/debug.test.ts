import {
  clearLogChannelLevels,
  clearLogSinks,
  createMemoryLogSink,
  getLogChannelLevel,
  getLogLevel,
  getMemoryLogSinkEntries,
  log,
  setLogLevel,
} from '@flighthq/log';
import type { MemoryLogSink } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disableDebug, enableDebug, isDebugEnabled, registerDebugSubsystem, unregisterDebugSubsystem } from './debug';

// Subsystem names touched by the tests, unregistered between each so the module-global registry
// never leaks state across cases.
const testSubsystemNames = ['render', 'input', 'audio', 'acme.custom'];

function readMemory(sink: MemoryLogSink): readonly unknown[] {
  return getMemoryLogSinkEntries(sink);
}

beforeEach(() => {
  if (isDebugEnabled()) disableDebug();
  for (const name of testSubsystemNames) unregisterDebugSubsystem(name);
  clearLogSinks();
  clearLogChannelLevels();
  setLogLevel(LogLevel.Verbose);
});

afterEach(() => {
  if (isDebugEnabled()) disableDebug();
  for (const name of testSubsystemNames) unregisterDebugSubsystem(name);
  clearLogSinks();
  clearLogChannelLevels();
  setLogLevel(LogLevel.Verbose);
});

describe('disableDebug', () => {
  it('removes the installed sink so a later log does not reach it', () => {
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem('render', { channels: ['render'] });
    enableDebug({ subsystems: ['render'], sink: memory.sink });

    log(LogLevel.Debug, 'before', 'render');
    expect(readMemory(memory)).toHaveLength(1);

    disableDebug();
    log(LogLevel.Debug, 'after', 'render');
    expect(readMemory(memory)).toHaveLength(1);
  });

  it('runs each enabled subsystem disableGuards binding', () => {
    const disableGuards = vi.fn();
    registerDebugSubsystem('render', { disableGuards });
    enableDebug({ subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(disableGuards).not.toHaveBeenCalled();
    disableDebug();
    expect(disableGuards).toHaveBeenCalledTimes(1);
  });

  it('restores the global level and clears the channel overrides it raised', () => {
    setLogLevel(LogLevel.Warn);
    registerDebugSubsystem('render', { channels: ['render'] });
    enableDebug({ subsystems: ['render'], level: LogLevel.Verbose, sink: createMemoryLogSink(1).sink });

    disableDebug();
    expect(getLogLevel()).toBe(LogLevel.Warn);
    expect(getLogChannelLevel('render')).toBeNull();
  });

  it('is a no-op when debug is not enabled', () => {
    expect(isDebugEnabled()).toBe(false);
    expect(() => disableDebug()).not.toThrow();
    expect(isDebugEnabled()).toBe(false);
  });
});

describe('enableDebug', () => {
  it('runs a selected subsystem enableGuards and raises its channel levels', () => {
    const enableGuards = vi.fn();
    registerDebugSubsystem('render', { channels: ['render', 'render.batch'], enableGuards });

    enableDebug({ subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(enableGuards).toHaveBeenCalledTimes(1);
    expect(getLogChannelLevel('render')).toBe(LogLevel.Debug);
    expect(getLogChannelLevel('render.batch')).toBe(LogLevel.Debug);
    expect(isDebugEnabled()).toBe(true);
  });

  it('routes a log on a raised channel to the installed sink', () => {
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem('render', { channels: ['render'] });
    enableDebug({ subsystems: ['render'], sink: memory.sink });

    log(LogLevel.Debug, { msg: 'draw' }, 'render');
    expect(readMemory(memory)).toHaveLength(1);
  });

  it('honors an explicit level and extra channels', () => {
    registerDebugSubsystem('render', { channels: ['render'] });
    enableDebug({
      subsystems: ['render'],
      level: LogLevel.Verbose,
      channels: ['app'],
      sink: createMemoryLogSink(1).sink,
    });

    expect(getLogLevel()).toBe(LogLevel.Verbose);
    expect(getLogChannelLevel('render')).toBe(LogLevel.Verbose);
    expect(getLogChannelLevel('app')).toBe(LogLevel.Verbose);
  });

  it('enables every registered subsystem when none are named', () => {
    const renderGuards = vi.fn();
    const inputGuards = vi.fn();
    registerDebugSubsystem('render', { enableGuards: renderGuards });
    registerDebugSubsystem('input', { enableGuards: inputGuards });

    enableDebug({ sink: createMemoryLogSink(1).sink });

    expect(renderGuards).toHaveBeenCalledTimes(1);
    expect(inputGuards).toHaveBeenCalledTimes(1);
  });

  it('skips an unregistered subsystem name without throwing', () => {
    const memory = createMemoryLogSink(1);
    expect(() => enableDebug({ subsystems: ['audio'], sink: memory.sink })).not.toThrow();
    expect(isDebugEnabled()).toBe(true);
  });

  it('is idempotent — a second enable while active does not re-run guards or re-install', () => {
    const enableGuards = vi.fn();
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem('render', { channels: ['render'], enableGuards });

    enableDebug({ subsystems: ['render'], sink: memory.sink });
    enableDebug({ subsystems: ['render'], sink: memory.sink });

    expect(enableGuards).toHaveBeenCalledTimes(1);
    log(LogLevel.Debug, 'once', 'render');
    expect(readMemory(memory)).toHaveLength(1);
  });
});

describe('isDebugEnabled', () => {
  it('reports the enable/disable lifecycle', () => {
    expect(isDebugEnabled()).toBe(false);
    enableDebug({ sink: createMemoryLogSink(1).sink });
    expect(isDebugEnabled()).toBe(true);
    disableDebug();
    expect(isDebugEnabled()).toBe(false);
  });
});

describe('registerDebugSubsystem', () => {
  it('drives a newly registered subsystem through enableDebug', () => {
    const enableGuards = vi.fn();
    registerDebugSubsystem('acme.custom', { channels: ['acme.custom'], enableGuards });

    enableDebug({ subsystems: ['acme.custom'], sink: createMemoryLogSink(1).sink });

    expect(enableGuards).toHaveBeenCalledTimes(1);
    expect(getLogChannelLevel('acme.custom')).toBe(LogLevel.Debug);
  });

  it('is last-write-wins for a repeated name', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerDebugSubsystem('render', { enableGuards: first });
    registerDebugSubsystem('render', { enableGuards: second });

    enableDebug({ subsystems: ['render'], sink: createMemoryLogSink(1).sink });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterDebugSubsystem', () => {
  it('returns true and stops the subsystem from being driven', () => {
    const enableGuards = vi.fn();
    registerDebugSubsystem('render', { enableGuards });

    expect(unregisterDebugSubsystem('render')).toBe(true);
    enableDebug({ subsystems: ['render'], sink: createMemoryLogSink(1).sink });
    expect(enableGuards).not.toHaveBeenCalled();
  });

  it('returns false for a name that was never registered', () => {
    expect(unregisterDebugSubsystem('audio')).toBe(false);
  });
});
