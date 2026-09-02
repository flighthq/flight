import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { disableEntityRuntimeGuards, enableEntityRuntimeGuards } from './enableEntityRuntimeGuards';
import { createEntity } from './entity';
import { areEntityRuntimeGuardsEnabled, createGuardedEntity, createGuardedEntityRuntime } from './guards';
import { createEntityRuntime } from './runtime';

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

describe('disableEntityRuntimeGuards', () => {
  it('uninstalls both the proxies and the reporter', () => {
    const entries = captureLog(() => {
      enableEntityRuntimeGuards();
      disableEntityRuntimeGuards();
      createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined;
    });
    expect(entries.length).toBe(0);
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});

describe('enableEntityRuntimeGuards', () => {
  it('WARNS through the log sink on a direct runtime-slot write', () => {
    const entries = captureLog(() => {
      enableEntityRuntimeGuards();
      try {
        createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined;
      } finally {
        disableEntityRuntimeGuards();
      }
    });
    expect(entries.length).toBe(1);
    // Names a function that actually exists: the point of the warning is that the caller can act on it.
    expect(messageOf(entries[0])).toContain('attachEntityBinding');
  });

  it('WARNS separately for a direct binding-slot write', () => {
    const entries = captureLog(() => {
      enableEntityRuntimeGuards();
      try {
        createGuardedEntityRuntime(createEntityRuntime()).binding = null;
      } finally {
        disableEntityRuntimeGuards();
      }
    });
    expect(entries.length).toBe(1);
    expect(messageOf(entries[0])).toContain('attachEntityBinding');
    expect(messageOf(entries[0])).toContain('detachEntityBinding');
  });

  it('stays SILENT without the guard — the production default', () => {
    const entries = captureLog(() => {
      // Unguarded entities are returned as-is, so there is nothing to intercept.
      createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined;
    });
    expect(entries.length).toBe(0);
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});
