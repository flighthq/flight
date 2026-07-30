import type { ShortcutBackend } from '@flighthq/types/contract';

import { explainGlobalShortcutRegistration } from './explainGlobalShortcutRegistration';
import { setShortcutBackend } from './shortcut';

function nativeBackend(registered: readonly string[] = []): ShortcutBackend {
  const entries = new Set(registered);
  return {
    getRegistered() {
      return [...entries];
    },
    isRegistered(accelerator) {
      return entries.has(accelerator);
    },
    register(accelerator) {
      entries.add(accelerator);
      return true;
    },
    setAllEnabled() {},
    setEnabled() {
      return true;
    },
    unregister(accelerator) {
      return entries.delete(accelerator);
    },
    unregisterAll() {
      entries.clear();
    },
  };
}

afterEach(() => {
  setShortcutBackend(null);
});

describe('explainGlobalShortcutRegistration', () => {
  it('reports ok for a free chord on a native backend', () => {
    setShortcutBackend(nativeBackend());
    expect(explainGlobalShortcutRegistration('Ctrl+Shift+K')).toEqual({
      accelerator: 'Ctrl+Shift+K',
      hasNativeBackend: true,
      normalized: 'Control+Shift+K',
      parseError: null,
      registered: false,
      reason: 'ok',
    });
  });

  it('reports already-registered through an alias spelling, since the register path normalizes first', () => {
    setShortcutBackend(nativeBackend(['Control+Shift+K']));
    const explanation = explainGlobalShortcutRegistration('ctrl+shift+k');
    expect(explanation.reason).toBe('already-registered');
    expect(explanation.normalized).toBe('Control+Shift+K');
    expect(explanation.registered).toBe(true);
    expect(explanation.parseError).toBeNull();
  });

  it('reports no-native-backend on the web default, and never claims a registration there', () => {
    const explanation = explainGlobalShortcutRegistration('Control+K');
    expect(explanation.reason).toBe('no-native-backend');
    expect(explanation.hasNativeBackend).toBe(false);
    expect(explanation.registered).toBe(false);
    expect(explanation.normalized).toBe('Control+K');
  });

  it('reports unparseable with the parse error, outranking a missing backend', () => {
    const explanation = explainGlobalShortcutRegistration('Control+NotAKey');
    expect(explanation.reason).toBe('unparseable');
    expect(explanation.normalized).toBeNull();
    expect(explanation.parseError).toEqual({ reason: 'unknown-key', token: 'NotAKey' });
    // The backend is also missing here, but the input error is the root cause and wins.
    expect(explanation.hasNativeBackend).toBe(false);
  });

  it('echoes the caller spelling rather than the normalized form', () => {
    setShortcutBackend(nativeBackend());
    expect(explainGlobalShortcutRegistration('cmd-shift-p').accelerator).toBe('cmd-shift-p');
  });

  it('registers nothing and mutates no state', () => {
    const backend = nativeBackend();
    setShortcutBackend(backend);
    explainGlobalShortcutRegistration('Control+K');
    explainGlobalShortcutRegistration('Control+K');
    expect(backend.getRegistered()).toEqual([]);
  });

  it('does not throw on empty or garbage input', () => {
    expect(explainGlobalShortcutRegistration('').reason).toBe('unparseable');
    expect(explainGlobalShortcutRegistration('').parseError).toEqual({ reason: 'empty', token: '' });
    expect(explainGlobalShortcutRegistration('Control+').parseError).toEqual({ reason: 'missing-key', token: '' });
  });
});
