import {
  addLogSink,
  clearLogOnceKeys,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogEntry, ShortcutBackend, ShortcutDrop } from '@flighthq/types/contract';

import { disableShortcutGuards, enableShortcutGuards } from './enableShortcutGuards';
import { registerGlobalShortcut, setShortcutBackend, setShortcutDropGuard, unregisterGlobalShortcut } from './shortcut';

// A native-looking backend, so the no-native-backend drop does not fire and the parse drop can be
// observed alone.
function nativeBackend(): ShortcutBackend {
  return {
    getRegistered() {
      return [];
    },
    isRegistered() {
      return false;
    },
    register() {
      return true;
    },
    setAllEnabled() {},
    setEnabled() {
      return false;
    },
    unregister() {
      return true;
    },
    unregisterAll() {},
  };
}

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
  return String((entry.data as Record<string, unknown>).message);
}

afterEach(() => {
  clearLogOnceKeys();
  disableShortcutGuards();
  setShortcutBackend(null);
});

describe('disableShortcutGuards', () => {
  it('uninstalls the guard so a later drop reports nothing', () => {
    setShortcutBackend(nativeBackend());
    enableShortcutGuards();
    disableShortcutGuards();
    const entries = captureLog(() => {
      registerGlobalShortcut('Control+NotAKey', () => {});
    });
    expect(entries.length).toBe(0);
  });

  it('is safe to call without a prior enable', () => {
    expect(() => disableShortcutGuards()).not.toThrow();
  });
});

describe('enableShortcutGuards', () => {
  it('warns once, naming the call and the parse reason, when an accelerator does not parse', () => {
    setShortcutBackend(nativeBackend());
    enableShortcutGuards();
    const entries = captureLog(() => {
      registerGlobalShortcut('Control+NotAKey', () => {});
    });
    expect(entries.length).toBe(1);
    const message = messageOf(entries[0]);
    expect(message).toContain('registerGlobalShortcut');
    expect(message).toContain('Control+NotAKey');
    expect(message).toContain('unknown-key');
    expect(message).toContain("at 'NotAKey'");
  });

  it('suppresses a repeat of the same reason', () => {
    setShortcutBackend(nativeBackend());
    enableShortcutGuards();
    captureLog(() => {
      registerGlobalShortcut('Control+NotAKey', () => {});
    });
    const entries = captureLog(() => {
      unregisterGlobalShortcut('Control+AlsoNotAKey');
    });
    expect(entries.length).toBe(0);
  });

  it('warns once when a command reaches the default web backend, naming the missing native backend', () => {
    enableShortcutGuards();
    const entries = captureLog(() => {
      registerGlobalShortcut('Control+K', () => {});
    });
    expect(entries.length).toBe(1);
    const message = messageOf(entries[0]);
    expect(message).toContain('registerGlobalShortcut');
    expect(message).toContain('no native shortcut backend');
    expect(message).toContain('setShortcutBackend');
  });

  it('stays silent once a native backend is installed — a native false is an answer, not a drop', () => {
    setShortcutBackend(nativeBackend());
    enableShortcutGuards();
    const entries = captureLog(() => {
      registerGlobalShortcut('Control+K', () => {});
    });
    expect(entries.length).toBe(0);
  });

  it('is idempotent — a second enable leaves exactly one guard installed', () => {
    enableShortcutGuards();
    enableShortcutGuards();
    const drops: ShortcutDrop[] = [];
    setShortcutDropGuard((drop) => drops.push({ ...drop }));
    registerGlobalShortcut('Control+K', () => {});
    expect(drops.length).toBe(1);
  });
});
