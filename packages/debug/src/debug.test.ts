// Generated from crates/flight-debug/tests/debug_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getLogChannelLevel,
  getLogLevel,
  getMemoryLogSinkEntries,
  log,
  setLogChannelLevel,
  setLogLevel,
} from '@flighthq/log/contract';
import type { LogStateRef } from '@flighthq/log/contract';
import {
  areColorAdjustmentGuardsEnabled,
  areRenderRegistriesGuardsEnabled,
  createRenderState,
} from '@flighthq/render/contract';
import { LogLevel } from '@flighthq/types/contract';
import type { LogEntry, MemoryLogSink as MemoryLogSinkRaw } from '@flighthq/types/contract';
import type { DebugOptions, DebugSubsystemHooks } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createDebugState,
  disableDebug,
  enableDebug,
  enableFlightDiagnostics,
  initializeDebugState,
  isDebugEnabled,
  registerDebugSubsystem,
  unregisterDebugSubsystem,
} from './contract.ts';
import type { DebugState } from './debug.ts';

function calls(count: { value: number }): number {
  return count.value;
}

function counted(): readonly [() => void, { value: number }] {
  const calls = { value: 0 };
  const counter = calls;
  const binding: () => void = () => {
    counter.value += 1;
  };
  return [binding, calls];
}

function entries(sink: Readonly<MemoryLogSinkRaw>): LogEntry[] {
  let out = [] as never[];
  getMemoryLogSinkEntries(out, sink);
  return out;
}

function hooks(
  channels: Readonly<string[]>,
  enableGuards: (() => void) | undefined,
  disableGuards: (() => void) | undefined,
): DebugSubsystemHooks {
  return {
    channels: channels.length === 0 ? undefined : channels.map((channel) => String(channel)),
    disableGuards: disableGuards,
    enableGuards: enableGuards,
  };
}

function options(sink: (arg0: Readonly<LogEntry>) => void): DebugOptions {
  return { channels: undefined, level: undefined, sink: sink, subsystems: undefined };
}

function states(): readonly [DebugState, LogStateRef] {
  const logState: LogStateRef = createLogState();
  setLogLevel(logState, LogLevel.Verbose);
  return [createDebugState(), logState];
}

function subsystems(names: Readonly<string[]>): string[] | undefined {
  return names.map((name) => String(name));
}

describe('createDebugState', () => {
  it('starts with no session and no registered subsystem', () => {
    const [state, logState] = states();
    expect(!isDebugEnabled(state)).toBe(true);
    expect(!unregisterDebugSubsystem(state, 'render')).toBe(true);
    disableDebug(state, logState);
    expect(!isDebugEnabled(state)).toBe(true);
  });
});

describe('disableDebug', () => {
  it('removes the installed sink so a later log does not reach it', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    let opts = options(memory.sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    log(logState, 0.0, LogLevel.Debug, 'before', 'render');
    expect(entries(memory).length).toEqual(1);
    disableDebug(state, logState);
    log(logState, 0.0, LogLevel.Debug, 'after', 'render');
    expect(entries(memory).length).toEqual(1);
  });
  it('runs each enabled subsystem disable guards binding', () => {
    const [state, logState] = states();
    const [disableGuards, disabled] = counted();
    registerDebugSubsystem(state, 'render', hooks([], undefined, disableGuards));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    expect(calls(disabled)).toEqual(0);
    disableDebug(state, logState);
    expect(calls(disabled)).toEqual(1);
  });
  it('restores the global level and clears the channel overrides it raised', () => {
    const [state, logState] = states();
    setLogLevel(logState, LogLevel.Warn);
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    opts.level = LogLevel.Verbose;
    enableDebug(state, logState, opts);
    disableDebug(state, logState);
    expect(getLogLevel(logState)).toEqual(LogLevel.Warn);
    expect(getLogChannelLevel(logState, 'render') ?? LogLevel.None).toEqual(LogLevel.None);
  });
  it('preserves channel overrides the caller set before the session', () => {
    const [state, logState] = states();
    setLogChannelLevel(logState, 'unrelated', LogLevel.Error);
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    expect(getLogChannelLevel(logState, 'render')).toEqual(LogLevel.Debug);
    disableDebug(state, logState);
    expect(getLogChannelLevel(logState, 'render') ?? LogLevel.None).toEqual(LogLevel.None);
    expect(getLogChannelLevel(logState, 'unrelated')).toEqual(LogLevel.Error);
  });
  it('restores a pre existing override on a channel debug also raised', () => {
    const [state, logState] = states();
    setLogChannelLevel(logState, 'render', LogLevel.Warn);
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    opts.level = LogLevel.Verbose;
    enableDebug(state, logState, opts);
    expect(getLogChannelLevel(logState, 'render')).toEqual(LogLevel.Verbose);
    disableDebug(state, logState);
    expect(getLogChannelLevel(logState, 'render')).toEqual(LogLevel.Warn);
  });
  it('is a no op when debug is not enabled', () => {
    const [state, logState] = states();
    expect(!isDebugEnabled(state)).toBe(true);
    disableDebug(state, logState);
    expect(!isDebugEnabled(state)).toBe(true);
  });
});

describe('enableDebug', () => {
  it('runs a selected subsystem enable guards and raises its channel levels', () => {
    const [state, logState] = states();
    const [enableGuards, enabled] = counted();
    registerDebugSubsystem(state, 'render', hooks(['render', 'render.batch'], enableGuards, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    expect(calls(enabled)).toEqual(1);
    expect(getLogChannelLevel(logState, 'render')).toEqual(LogLevel.Debug);
    expect(getLogChannelLevel(logState, 'render.batch')).toEqual(LogLevel.Debug);
    expect(isDebugEnabled(state)).toBe(true);
  });
  it('routes a log on a raised channel to the installed sink', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    let opts = options(memory.sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    log(logState, 0.0, LogLevel.Debug, 'draw', 'render');
    expect(entries(memory).length).toEqual(1);
  });
  it('honors an explicit level and extra channels', () => {
    const [state, logState] = states();
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    opts.level = LogLevel.Verbose;
    opts.channels = ['app'];
    enableDebug(state, logState, opts);
    expect(getLogLevel(logState)).toEqual(LogLevel.Verbose);
    expect(getLogChannelLevel(logState, 'render')).toEqual(LogLevel.Verbose);
    expect(getLogChannelLevel(logState, 'app')).toEqual(LogLevel.Verbose);
  });
  it('enables every registered subsystem when none are named', () => {
    const [state, logState] = states();
    const [renderGuards, render] = counted();
    const [inputGuards, input] = counted();
    registerDebugSubsystem(state, 'render', hooks([], renderGuards, undefined));
    registerDebugSubsystem(state, 'input', hooks([], inputGuards, undefined));
    enableDebug(state, logState, options(createMemoryLogSink(1).sink));
    expect(calls(render)).toEqual(1);
    expect(calls(input)).toEqual(1);
  });
  it('skips an unregistered subsystem name without throwing', () => {
    const [state, logState] = states();
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['audio']);
    enableDebug(state, logState, opts);
    expect(isDebugEnabled(state)).toBe(true);
  });
  it('is idempotent a second enable while active does not re run guards or re install', () => {
    const [state, logState] = states();
    const [enableGuards, enabled] = counted();
    const memory = createMemoryLogSink(16);
    registerDebugSubsystem(state, 'render', hooks(['render'], enableGuards, undefined));
    let opts = options(memory.sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    enableDebug(state, logState, opts);
    expect(calls(enabled)).toEqual(1);
    log(logState, 0.0, LogLevel.Debug, 'once', 'render');
    expect(entries(memory).length).toEqual(1);
  });
  it('installs a console sink by default and disable removes exactly that sink', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(4);
    addLogSink(logState, memory.sink);
    enableDebug(state, logState, undefined);
    expect(logState!.sinks.length).toEqual(2);
    log(logState, 0.0, LogLevel.Debug, 'console', undefined);
    expect(entries(memory).length).toEqual(1);
    disableDebug(state, logState);
    const sinks = logState!.sinks;
    expect(sinks.length).toEqual(1);
    expect(sinks[0] === memory.sink).toBe(true);
  });
  it('unwinds a partially enabled guard transaction without masking its original error', () => {
    const [state, logState] = states();
    const memory = createMemoryLogSink(16);
    const active: { value: string[] } = { value: [] as never[] };
    const rollbackOrder: { value: string[] } = { value: [] as never[] };
    const subsystem = (name: string, failEnable: boolean, failRollback: boolean) => {
      const [on, off, order] = [active, active, rollbackOrder] as const;
      const [enableName, disableName] = [String(name), String(name)] as const;
      const enable: () => void = () => {
        on.value.push(enableName);
        if (failEnable) {
          throw new Error(`audio guard enable failed`);
        }
      };
      const disable: () => void = () => {
        (<T>(items: T[], keep: (item: T) => boolean): void => {
          let kept = 0;
          let index = 0;
          try {
            for (; index < items.length; index += 1) {
              const item = items[index];
              if (keep(item)) {
                items[kept] = item;
                kept += 1;
              }
            }
          } finally {
            const length = items.length;
            for (let rest = index; rest < length; rest += 1) {
              items[kept + rest - index] = items[rest];
            }
            items.length = kept + length - index;
          }
        })(off.value, (guard) => guard !== disableName);
        order.value.push(disableName);
        if (failRollback) {
          throw new Error(`input guard rollback failed`);
        }
      };
      return hooks([name], enable, disable);
    };
    registerDebugSubsystem(state, 'render', subsystem('render', false, false));
    registerDebugSubsystem(state, 'input', subsystem('input', false, true));
    registerDebugSubsystem(state, 'audio', subsystem('audio', true, false));
    setLogLevel(logState, LogLevel.Warn);
    setLogChannelLevel(logState, 'render', LogLevel.Error);
    setLogChannelLevel(logState, 'input', LogLevel.Info);
    setLogChannelLevel(logState, 'unrelated', LogLevel.Verbose);
    let opts = options(memory.sink);
    opts.subsystems = subsystems(['render', 'input', 'audio']);
    expect(() => {
      return enableDebug(state, logState, opts);
    }).toThrow(new Error('audio guard enable failed'));
    expect(!isDebugEnabled(state)).toBe(true);
    expect(active.value.length === 0).toBe(true);
    expect(rollbackOrder.value).toEqual(['audio', 'input', 'render']);
    expect(getLogLevel(logState)).toEqual(LogLevel.Warn);
    expect(getLogChannelLevel(logState, 'render')).toEqual(LogLevel.Error);
    expect(getLogChannelLevel(logState, 'input')).toEqual(LogLevel.Info);
    expect(getLogChannelLevel(logState, 'audio') ?? LogLevel.None).toEqual(LogLevel.None);
    expect(getLogChannelLevel(logState, 'unrelated')).toEqual(LogLevel.Verbose);
    log(logState, 0.0, LogLevel.Error, 'after failed enable', undefined);
    expect(entries(memory).length === 0).toBe(true);
  });
});

describe('enableFlightDiagnostics', () => {
  it('enables the console diagnostics session and every generic render guard for the state', () => {
    const [state, logState] = states();
    let renderState = createRenderState();
    enableFlightDiagnostics(state, logState, renderState);
    expect(isDebugEnabled(state)).toBe(true);
    expect(logState!.sinks.length).toEqual(1);
    expect(areColorAdjustmentGuardsEnabled(renderState)).toBe(true);
    expect(areRenderRegistriesGuardsEnabled(renderState)).toBe(true);
  });
});

describe('initializeDebugState', () => {
  it('is the construction initializer of create debug state', () => {
    const [state, logState] = states();
    registerDebugSubsystem(state, 'render', hooks(['render'], undefined, undefined));
    enableDebug(state, logState, options(createMemoryLogSink(1).sink));
    initializeDebugState(state!);
    expect(!isDebugEnabled(state)).toBe(true);
    expect(!unregisterDebugSubsystem(state, 'render')).toBe(true);
  });
});

describe('isDebugEnabled', () => {
  it('reports the enable disable lifecycle', () => {
    const [state, logState] = states();
    expect(!isDebugEnabled(state)).toBe(true);
    enableDebug(state, logState, options(createMemoryLogSink(1).sink));
    expect(isDebugEnabled(state)).toBe(true);
    disableDebug(state, logState);
    expect(!isDebugEnabled(state)).toBe(true);
  });
});

describe('registerDebugSubsystem', () => {
  it('drives a newly registered subsystem through enable debug', () => {
    const [state, logState] = states();
    const [enableGuards, enabled] = counted();
    registerDebugSubsystem(state, 'acme.custom', hooks(['acme.custom'], enableGuards, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['acme.custom']);
    enableDebug(state, logState, opts);
    expect(calls(enabled)).toEqual(1);
    expect(getLogChannelLevel(logState, 'acme.custom')).toEqual(LogLevel.Debug);
  });
  it('is last write wins for a repeated name', () => {
    const [state, logState] = states();
    const [first, firstCalls] = counted();
    const [second, secondCalls] = counted();
    registerDebugSubsystem(state, 'render', hooks([], first, undefined));
    registerDebugSubsystem(state, 'render', hooks([], second, undefined));
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    expect(calls(firstCalls)).toEqual(0);
    expect(calls(secondCalls)).toEqual(1);
  });
});

describe('unregisterDebugSubsystem', () => {
  it('returns true and stops the subsystem from being driven', () => {
    const [state, logState] = states();
    const [enableGuards, enabled] = counted();
    registerDebugSubsystem(state, 'render', hooks([], enableGuards, undefined));
    expect(unregisterDebugSubsystem(state, 'render')).toBe(true);
    let opts = options(createMemoryLogSink(1).sink);
    opts.subsystems = subsystems(['render']);
    enableDebug(state, logState, opts);
    expect(calls(enabled)).toEqual(0);
  });
  it('returns false for a name that was never registered', () => {
    const [state] = states();
    expect(!unregisterDebugSubsystem(state, 'audio')).toBe(true);
  });
});
