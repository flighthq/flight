import { clearSignal, connectSignal } from '@flighthq/signals/contract';
import type {
  AcceleratorParseError,
  ParsedAccelerator,
  ShortcutBackend,
  ShortcutDrop,
  ShortcutEvent,
  ShortcutModifier,
} from '@flighthq/types/contract';

import {
  createParsedAccelerator,
  disableGlobalShortcut,
  disposeGlobalShortcutSignals,
  enableGlobalShortcut,
  enableGlobalShortcutSignals,
  equalsAccelerator,
  findAcceleratorConflict,
  formatAcceleratorForDisplay,
  getAcceleratorKey,
  getAcceleratorKeyLabel,
  getAcceleratorModifierLabel,
  getAcceleratorModifiers,
  getRegisteredGlobalShortcuts,
  getShortcutBackend,
  hasGlobalShortcutConflict,
  hasNativeShortcutBackend,
  isAcceleratorValid,
  isGlobalShortcutRegistered,
  normalizeAccelerator,
  parseAccelerator,
  parseAcceleratorDetailed,
  registerGlobalShortcut,
  resolveCommandOrControlModifier,
  resumeAllGlobalShortcuts,
  setShortcutBackend,
  setShortcutDropGuard,
  suspendAllGlobalShortcuts,
  unregisterAllGlobalShortcuts,
  unregisterGlobalShortcut,
} from './shortcut';

// A full-featured fake backend for testing.
interface FakeBackend extends ShortcutBackend {
  entries: Map<string, { handler: (event: Readonly<ShortcutEvent>) => void; enabled: boolean }>;
  allEnabled: boolean;
}

function fakeBackend(): FakeBackend {
  const entries = new Map<string, { handler: (event: Readonly<ShortcutEvent>) => void; enabled: boolean }>();
  return {
    entries,
    allEnabled: true,
    getRegistered() {
      return [...entries.keys()];
    },
    isRegistered(accelerator) {
      return entries.has(accelerator);
    },
    register(accelerator, handler) {
      entries.set(accelerator, { handler, enabled: true });
      return true;
    },
    setAllEnabled(enabled) {
      this.allEnabled = enabled;
      for (const entry of entries.values()) entry.enabled = enabled;
    },
    setEnabled(accelerator, enabled) {
      const entry = entries.get(accelerator);
      if (!entry) return false;
      entry.enabled = enabled;
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
  setShortcutDropGuard(null);
  // Disconnect any signal listeners registered in this test to avoid cross-test bleed.
  const signals = enableGlobalShortcutSignals();
  clearSignal(signals.onTrigger);
});

describe('createParsedAccelerator', () => {
  it('returns a zeroed ParsedAccelerator', () => {
    const out = createParsedAccelerator();
    expect(out.key).toBe('');
    expect(out.modifiers).toEqual([]);
  });
});

describe('disableGlobalShortcut', () => {
  it('disables a registered shortcut without unregistering it', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+K', () => {});
    expect(disableGlobalShortcut('Control+K')).toBe(true);
    expect(backend.entries.get('Control+K')?.enabled).toBe(false);
    expect(isGlobalShortcutRegistered('Control+K')).toBe(true);
  });

  it('returns false on web backend', () => {
    expect(disableGlobalShortcut('Control+K')).toBe(false);
  });

  it('accepts alias spellings', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Ctrl+K', () => {});
    expect(disableGlobalShortcut('control+k')).toBe(true);
  });

  it('returns false for unparseable accelerator', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(disableGlobalShortcut('')).toBe(false);
  });
});

describe('disposeGlobalShortcutSignals', () => {
  it('disconnects onTrigger listeners so a later trigger does not reach them', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    const signals = enableGlobalShortcutSignals();
    let fired = 0;
    connectSignal(signals.onTrigger, () => {
      fired++;
    });
    registerGlobalShortcut('Control+K', () => {});
    backend.entries.get('Control+K')!.handler({ accelerator: 'Control+K' });
    expect(fired).toBe(1);

    disposeGlobalShortcutSignals();
    backend.entries.get('Control+K')!.handler({ accelerator: 'Control+K' });
    expect(fired).toBe(1);
  });

  it('arms a fresh group on the next enable — identity is not preserved across a dispose', () => {
    const before = enableGlobalShortcutSignals();
    disposeGlobalShortcutSignals();
    expect(enableGlobalShortcutSignals()).not.toBe(before);
  });

  it('leaves directly-registered handlers firing', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    enableGlobalShortcutSignals();
    let handled = 0;
    registerGlobalShortcut('Control+K', () => {
      handled++;
    });
    disposeGlobalShortcutSignals();
    backend.entries.get('Control+K')!.handler({ accelerator: 'Control+K' });
    expect(handled).toBe(1);
  });

  it('is a no-op when no group was armed', () => {
    disposeGlobalShortcutSignals();
    expect(() => disposeGlobalShortcutSignals()).not.toThrow();
  });
});

describe('enableGlobalShortcut', () => {
  it('re-enables a disabled shortcut', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+K', () => {});
    disableGlobalShortcut('Control+K');
    expect(enableGlobalShortcut('Control+K')).toBe(true);
    expect(backend.entries.get('Control+K')?.enabled).toBe(true);
  });

  it('returns false on web backend', () => {
    expect(enableGlobalShortcut('Control+K')).toBe(false);
  });

  it('returns false for unparseable accelerator', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(enableGlobalShortcut('')).toBe(false);
  });
});

describe('enableGlobalShortcutSignals', () => {
  it('returns a ShortcutSignals object with an onTrigger signal', () => {
    const signals = enableGlobalShortcutSignals();
    expect(signals).not.toBeNull();
    expect(signals.onTrigger).toBeDefined();
  });

  it('returns the same object on repeated calls (stable identity)', () => {
    const a = enableGlobalShortcutSignals();
    const b = enableGlobalShortcutSignals();
    expect(a).toBe(b);
  });

  it('fires onTrigger when a registered shortcut is triggered', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    const signals = enableGlobalShortcutSignals();
    const received: string[] = [];
    connectSignal(signals.onTrigger, (event) => received.push(event.accelerator));

    registerGlobalShortcut('Control+K', () => {});
    // Simulate OS triggering the shortcut via the backend's internal handler
    const entry = backend.entries.get('Control+K');
    entry?.handler({ accelerator: 'Control+K' });

    expect(received).toEqual(['Control+K']);
  });

  it('fires onTrigger after the direct handler has run', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    const signals = enableGlobalShortcutSignals();
    const order: string[] = [];

    connectSignal(signals.onTrigger, () => order.push('signal'));
    registerGlobalShortcut('Control+K', () => order.push('handler'));

    const entry = backend.entries.get('Control+K');
    entry?.handler({ accelerator: 'Control+K' });

    expect(order).toEqual(['handler', 'signal']);
  });

  it('does not fire for unregistered or unparseable accelerators', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    const signals = enableGlobalShortcutSignals();
    const received: string[] = [];
    connectSignal(signals.onTrigger, (event) => received.push(event.accelerator));

    // Unparseable: no registration call; no trigger
    registerGlobalShortcut('', () => {});

    expect(received).toHaveLength(0);
    expect(backend.entries.size).toBe(0);
  });
});

describe('equalsAccelerator', () => {
  it('returns true for same chord in different spellings', () => {
    expect(equalsAccelerator('Ctrl+K', 'Control+K')).toBe(true);
    expect(equalsAccelerator('Cmd+Shift+S', 'Meta+Shift+S')).toBe(true);
    expect(equalsAccelerator('ctrl+shift+k', 'Control+Shift+K')).toBe(true);
  });

  it('returns false for different chords', () => {
    expect(equalsAccelerator('Ctrl+K', 'Ctrl+S')).toBe(false);
    expect(equalsAccelerator('Ctrl+K', 'Alt+K')).toBe(false);
  });

  it('returns false when either accelerator is unparseable', () => {
    expect(equalsAccelerator('', 'Ctrl+K')).toBe(false);
    expect(equalsAccelerator('Ctrl+K', 'bad###key')).toBe(false);
    expect(equalsAccelerator('', '')).toBe(false);
  });

  it('is order-insensitive for modifiers', () => {
    expect(equalsAccelerator('Shift+Ctrl+K', 'Control+Shift+K')).toBe(true);
    expect(equalsAccelerator('Alt+Shift+Control+K', 'Ctrl+Shift+Alt+K')).toBe(true);
  });
});

describe('findAcceleratorConflict', () => {
  it('returns the conflicting candidate, in the caller spelling it was given in', () => {
    expect(findAcceleratorConflict('Control+K', ['Alt+J', 'ctrl-k', 'Meta+P'])).toBe('ctrl-k');
  });

  it('returns null when nothing in the list names the same chord', () => {
    expect(findAcceleratorConflict('Control+K', ['Alt+J', 'Meta+P'])).toBeNull();
  });

  it('returns the first conflict when several candidates name the chord', () => {
    expect(findAcceleratorConflict('Control+K', ['ctrl+k', 'Control-K'])).toBe('ctrl+k');
  });

  it('returns null for an unparseable accelerator, even against an identical unparseable candidate', () => {
    expect(findAcceleratorConflict('NotAKey', ['NotAKey'])).toBeNull();
  });

  it('skips unparseable candidates rather than matching them', () => {
    expect(findAcceleratorConflict('Control+K', ['NotAKey', '', 'Ctrl+K'])).toBe('Ctrl+K');
  });

  it('returns null for an empty candidate list', () => {
    expect(findAcceleratorConflict('Control+K', [])).toBeNull();
  });

  it('sees a pending binding list that hasGlobalShortcutConflict cannot — nothing is registered', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    const pending = ['Control+Shift+P'];
    expect(hasGlobalShortcutConflict('Control+Shift+P')).toBe(false);
    expect(findAcceleratorConflict('Control+Shift+P', pending)).toBe('Control+Shift+P');
  });
});

describe('formatAcceleratorForDisplay', () => {
  // Tests are environment-neutral: we just check the output is non-empty and contains
  // both the expected modifier component and key. Platform-specific symbol vs text is tested
  // via resolveCommandOrControlModifier golden tables in that function's own block.
  it('returns non-empty string for valid accelerator', () => {
    const result = formatAcceleratorForDisplay('Control+Shift+K');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for unparseable accelerator', () => {
    expect(formatAcceleratorForDisplay('')).toBe('');
    expect(formatAcceleratorForDisplay('bad###key')).toBe('');
  });

  it('formats single key with no modifiers', () => {
    const result = formatAcceleratorForDisplay('F5');
    expect(result).toBe('F5');
  });

  it('includes the key label in the output', () => {
    const result = formatAcceleratorForDisplay('Control+K');
    expect(result).toContain('K');
  });

  it('uses symbols with no separator on macOS (platform override)', () => {
    // macOS: ⌃⇧K (no '+' separator)
    const result = formatAcceleratorForDisplay('Control+Shift+K', 'macos');
    expect(result).toBe('⌃⇧K');
  });

  it('uses text labels with + separator on windows (platform override)', () => {
    const result = formatAcceleratorForDisplay('Control+Shift+K', 'windows');
    expect(result).toBe('Ctrl+Shift+K');
  });

  it('uses text labels with + separator on linux (platform override)', () => {
    const result = formatAcceleratorForDisplay('Control+Shift+K', 'linux');
    expect(result).toBe('Ctrl+Shift+K');
  });

  it('resolves CommandOrControl to Meta (⌘) on macOS', () => {
    const result = formatAcceleratorForDisplay('CommandOrControl+K', 'macos');
    expect(result).toBe('⌘K');
  });

  it('resolves CommandOrControl to Ctrl on windows', () => {
    const result = formatAcceleratorForDisplay('CommandOrControl+K', 'windows');
    expect(result).toBe('Ctrl+K');
  });
});

describe('getAcceleratorKey', () => {
  it('returns the canonical key for valid accelerators', () => {
    expect(getAcceleratorKey('Control+K')).toBe('K');
    expect(getAcceleratorKey('Shift+F1')).toBe('F1');
    expect(getAcceleratorKey('Ctrl+shift+arrowup')).toBe('ArrowUp');
    expect(getAcceleratorKey('Escape')).toBe('Escape');
  });

  it('returns null for unparseable input', () => {
    expect(getAcceleratorKey('')).toBeNull();
    expect(getAcceleratorKey('Control+')).toBeNull();
    expect(getAcceleratorKey('Control+InvalidKey123')).toBeNull();
  });

  it('handles aliases', () => {
    expect(getAcceleratorKey('Ctrl+Esc')).toBe('Escape');
    expect(getAcceleratorKey('Cmd+Del')).toBe('Delete');
    expect(getAcceleratorKey('Alt+Enter')).toBe('Return');
  });
});

describe('getAcceleratorKeyLabel', () => {
  it('returns symbol labels for special keys', () => {
    expect(getAcceleratorKeyLabel('ArrowUp')).toBe('↑');
    expect(getAcceleratorKeyLabel('ArrowDown')).toBe('↓');
    expect(getAcceleratorKeyLabel('Return')).toBe('↵');
    expect(getAcceleratorKeyLabel('Escape')).toBe('Esc');
    expect(getAcceleratorKeyLabel('Tab')).toBe('⇥');
    expect(getAcceleratorKeyLabel('Backspace')).toBe('⌫');
  });

  it('returns key name as-is for ordinary keys', () => {
    expect(getAcceleratorKeyLabel('K')).toBe('K');
    expect(getAcceleratorKeyLabel('F1')).toBe('F1');
    expect(getAcceleratorKeyLabel('Space')).toBe('Space');
  });
});

describe('getAcceleratorModifierLabel', () => {
  it('returns non-empty labels for all modifiers', () => {
    const modifiers: ShortcutModifier[] = ['Alt', 'Control', 'Meta', 'Shift', 'Super', 'CommandOrControl'];
    for (const m of modifiers) {
      expect(getAcceleratorModifierLabel(m).length).toBeGreaterThan(0);
    }
  });

  it('resolves CommandOrControl without returning empty string', () => {
    const label = getAcceleratorModifierLabel('CommandOrControl');
    expect(label).not.toBe('');
  });

  it('returns macOS symbols with platform override', () => {
    expect(getAcceleratorModifierLabel('Control', 'macos')).toBe('⌃');
    expect(getAcceleratorModifierLabel('Alt', 'macos')).toBe('⌥');
    expect(getAcceleratorModifierLabel('Shift', 'macos')).toBe('⇧');
    expect(getAcceleratorModifierLabel('Meta', 'macos')).toBe('⌘');
  });

  it('returns text labels on non-macOS with platform override', () => {
    expect(getAcceleratorModifierLabel('Control', 'windows')).toBe('Ctrl');
    expect(getAcceleratorModifierLabel('Alt', 'linux')).toBe('Alt');
    expect(getAcceleratorModifierLabel('Shift', 'windows')).toBe('Shift');
    expect(getAcceleratorModifierLabel('Meta', 'linux')).toBe('Win');
  });

  it('resolves CommandOrControl to ⌘ on macOS via platform override', () => {
    expect(getAcceleratorModifierLabel('CommandOrControl', 'macos')).toBe('⌘');
  });

  it('resolves CommandOrControl to Ctrl on windows via platform override', () => {
    expect(getAcceleratorModifierLabel('CommandOrControl', 'windows')).toBe('Ctrl');
  });
});

describe('getAcceleratorModifiers', () => {
  it('returns modifiers in canonical order', () => {
    const out: ShortcutModifier[] = [];
    const result = getAcceleratorModifiers('Shift+Control+K', out);
    expect(result).toBe(out);
    expect(out).toEqual(['Control', 'Shift']);
  });

  it('clears the out array and fills it', () => {
    const out: ShortcutModifier[] = ['Meta'];
    const result = getAcceleratorModifiers('Alt+K', out);
    expect(result).toBe(out);
    expect(out).toEqual(['Alt']);
  });

  it('returns null for unparseable input', () => {
    const out: ShortcutModifier[] = [];
    expect(getAcceleratorModifiers('', out)).toBeNull();
    expect(out).toHaveLength(0);
  });

  it('returns empty array for modifier-free accelerator', () => {
    const out: ShortcutModifier[] = [];
    const result = getAcceleratorModifiers('F5', out);
    expect(result).toBe(out);
    expect(out).toEqual([]);
  });
});

describe('getRegisteredGlobalShortcuts', () => {
  it('returns empty array on web backend', () => {
    expect(getRegisteredGlobalShortcuts()).toEqual([]);
  });

  it('returns all registered normalized accelerators', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+K', () => {});
    // Canonical modifier order: Control < Alt < Shift < Meta < Super → 'Shift+Meta+S'
    registerGlobalShortcut('Meta+Shift+S', () => {});
    const registered = getRegisteredGlobalShortcuts();
    expect(registered).toContain('Control+K');
    expect(registered).toContain('Shift+Meta+S');
    expect(registered).toHaveLength(2);
  });

  it('re-normalizes raw backend entries and drops unparseable ones', () => {
    // A native backend may populate the registry with non-normalized or invalid strings; the getter
    // normalizes them rather than trusting the cast, so the Accelerator type is earned.
    const backend = fakeBackend();
    backend.getRegistered = () => ['ctrl+shift+k', 'Meta+Alt+S', 'bad###key'];
    setShortcutBackend(backend);
    const registered = getRegisteredGlobalShortcuts();
    expect(registered).toEqual(['Control+Shift+K', 'Alt+Meta+S']);
  });
});

describe('getShortcutBackend', () => {
  it('falls back to a web backend', () => {
    expect(getShortcutBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(getShortcutBackend()).toBe(backend);
  });
});

describe('getShortcutBackend (sentinel)', () => {
  it('returns sentinels without throwing (web has no global hotkeys)', () => {
    const backend = getShortcutBackend();
    expect(backend.register('Control+K', () => {})).toBe(false);
    expect(backend.unregister('Control+K')).toBe(false);
    expect(backend.isRegistered('Control+K')).toBe(false);
    expect(backend.setEnabled('Control+K', false)).toBe(false);
    expect(backend.getRegistered()).toEqual([]);
    expect(() => backend.unregisterAll()).not.toThrow();
    expect(() => backend.setAllEnabled(false)).not.toThrow();
  });
});

describe('hasGlobalShortcutConflict', () => {
  it('returns true when the chord is already registered', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+K', () => {});
    expect(hasGlobalShortcutConflict('Control+K')).toBe(true);
    expect(hasGlobalShortcutConflict('ctrl+k')).toBe(true);
  });

  it('returns false when not registered', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(hasGlobalShortcutConflict('Control+K')).toBe(false);
  });

  it('returns false for unparseable accelerator', () => {
    expect(hasGlobalShortcutConflict('')).toBe(false);
    expect(hasGlobalShortcutConflict('bad###key')).toBe(false);
  });
});

describe('hasNativeShortcutBackend', () => {
  it('is false on the web default and true once a backend is installed', () => {
    expect(hasNativeShortcutBackend()).toBe(false);
    setShortcutBackend(fakeBackend());
    expect(hasNativeShortcutBackend()).toBe(true);
    setShortcutBackend(null);
    expect(hasNativeShortcutBackend()).toBe(false);
  });

  it('stays false when getShortcutBackend has lazily built the web default', () => {
    getShortcutBackend();
    expect(hasNativeShortcutBackend()).toBe(false);
  });
});

describe('isAcceleratorValid', () => {
  it('returns true for well-formed accelerators', () => {
    expect(isAcceleratorValid('Control+K')).toBe(true);
    expect(isAcceleratorValid('Meta+Shift+S')).toBe(true);
    expect(isAcceleratorValid('F5')).toBe(true);
    expect(isAcceleratorValid('Escape')).toBe(true);
    expect(isAcceleratorValid('ctrl+shift+k')).toBe(true);
    expect(isAcceleratorValid('CommandOrControl+Q')).toBe(true);
  });

  it('returns false for malformed accelerators', () => {
    expect(isAcceleratorValid('')).toBe(false);
    expect(isAcceleratorValid('Control+')).toBe(false);
    expect(isAcceleratorValid('UnknownMod+K')).toBe(false);
    expect(isAcceleratorValid('Control+InvalidKey999')).toBe(false);
  });

  it('accepts all ShortcutKeyName values', () => {
    // A representative sample across categories
    for (const key of [
      'A',
      'Z',
      '0',
      '9',
      'F1',
      'F12',
      'F24',
      'Space',
      'Tab',
      'Return',
      'ArrowUp',
      'Home',
      'End',
      'PageDown',
      'Numpad0',
      'MediaPlayPause',
      'CapsLock',
    ]) {
      expect(isAcceleratorValid(key)).toBe(true);
    }
  });
});

describe('isGlobalShortcutRegistered', () => {
  it('reflects backend state', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(isGlobalShortcutRegistered('Control+S')).toBe(false);
    registerGlobalShortcut('Control+S', () => {});
    expect(isGlobalShortcutRegistered('Control+S')).toBe(true);
  });

  it('returns false on the web backend', () => {
    expect(isGlobalShortcutRegistered('Control+S')).toBe(false);
  });

  it('normalizes before querying — alias spellings match', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Ctrl+S', () => {});
    expect(isGlobalShortcutRegistered('Control+S')).toBe(true);
    expect(isGlobalShortcutRegistered('ctrl+s')).toBe(true);
  });

  it('returns false for unparseable accelerator', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(isGlobalShortcutRegistered('')).toBe(false);
  });
});

describe('normalizeAccelerator', () => {
  it('returns canonical form for standard spellings', () => {
    expect(normalizeAccelerator('Control+K')).toBe('Control+K');
    // Canonical modifier order: Control < Alt < Shift < Meta < Super
    expect(normalizeAccelerator('Meta+Shift+S')).toBe('Shift+Meta+S');
    expect(normalizeAccelerator('F5')).toBe('F5');
  });

  it('normalizes modifier aliases', () => {
    expect(normalizeAccelerator('Ctrl+K')).toBe('Control+K');
    expect(normalizeAccelerator('Cmd+K')).toBe('Meta+K');
    expect(normalizeAccelerator('Command+K')).toBe('Meta+K');
    expect(normalizeAccelerator('Option+K')).toBe('Alt+K');
    expect(normalizeAccelerator('Win+K')).toBe('Super+K');
  });

  it('normalizes case', () => {
    expect(normalizeAccelerator('ctrl+shift+k')).toBe('Control+Shift+K');
    expect(normalizeAccelerator('CTRL+SHIFT+K')).toBe('Control+Shift+K');
  });

  it('normalizes modifier order (Control < Alt < Shift < Meta < Super)', () => {
    expect(normalizeAccelerator('Shift+Control+K')).toBe('Control+Shift+K');
    expect(normalizeAccelerator('Alt+Shift+Control+K')).toBe('Control+Alt+Shift+K');
    expect(normalizeAccelerator('Meta+Alt+Shift+Control+K')).toBe('Control+Alt+Shift+Meta+K');
    expect(normalizeAccelerator('Meta+Shift+K')).toBe('Shift+Meta+K');
  });

  it('normalizes key name aliases', () => {
    expect(normalizeAccelerator('Ctrl+Esc')).toBe('Control+Escape');
    expect(normalizeAccelerator('Ctrl+Del')).toBe('Control+Delete');
    expect(normalizeAccelerator('Ctrl+Enter')).toBe('Control+Return');
    expect(normalizeAccelerator('Ctrl+Up')).toBe('Control+ArrowUp');
    expect(normalizeAccelerator('Ctrl+Down')).toBe('Control+ArrowDown');
  });

  it('returns null for empty input', () => {
    expect(normalizeAccelerator('')).toBeNull();
    expect(normalizeAccelerator('   ')).toBeNull();
  });

  it('returns null for missing key', () => {
    expect(normalizeAccelerator('Control+')).toBeNull();
    expect(normalizeAccelerator('Control+Shift+')).toBeNull();
  });

  it('returns null for unknown modifier', () => {
    expect(normalizeAccelerator('UnknownMod+K')).toBeNull();
  });

  it('returns null for unknown key', () => {
    expect(normalizeAccelerator('Control+InvalidKey999')).toBeNull();
  });

  it('accepts dash separator', () => {
    expect(normalizeAccelerator('Ctrl-K')).toBe('Control+K');
    expect(normalizeAccelerator('Ctrl-Shift-K')).toBe('Control+Shift+K');
  });

  it('reaches a literal +/- key, so the conventional zoom pair parses', () => {
    expect(normalizeAccelerator('CommandOrControl+-')).toBe('CommandOrControl+Minus');
    expect(normalizeAccelerator('CommandOrControl++')).toBe('CommandOrControl+Plus');
    expect(normalizeAccelerator('Ctrl+-')).toBe('Control+Minus');
    expect(normalizeAccelerator('Ctrl++')).toBe('Control+Plus');
  });

  it('accepts a bare +/- as a one-key accelerator', () => {
    expect(normalizeAccelerator('-')).toBe('Minus');
    expect(normalizeAccelerator('+')).toBe('Plus');
  });

  it('reaches a literal +/- through the dash separator too', () => {
    expect(normalizeAccelerator('Ctrl-+')).toBe('Control+Plus');
    expect(normalizeAccelerator('Ctrl--')).toBe('Control+Minus');
  });

  it('round-trips a literal +/- chord through its own normalized form', () => {
    const once = normalizeAccelerator('Ctrl+-');
    expect(normalizeAccelerator(once!)).toBe(once);
  });

  it('normalizes the named spellings of +/- to the same chord as the literals', () => {
    expect(normalizeAccelerator('Ctrl+Minus')).toBe(normalizeAccelerator('Ctrl+-'));
    expect(normalizeAccelerator('Ctrl+Plus')).toBe(normalizeAccelerator('Ctrl++'));
  });

  it('normalizes the Electron numpad short spellings', () => {
    expect(normalizeAccelerator('Ctrl+numadd')).toBe('Control+NumpadAdd');
    expect(normalizeAccelerator('Ctrl+numsub')).toBe('Control+NumpadSubtract');
    expect(normalizeAccelerator('Ctrl+nummult')).toBe('Control+NumpadMultiply');
    expect(normalizeAccelerator('Ctrl+numdiv')).toBe('Control+NumpadDivide');
    expect(normalizeAccelerator('Ctrl+numdec')).toBe('Control+NumpadDecimal');
  });

  it('rejects a separator glued to a key name rather than silently dropping it', () => {
    // 'Ctrl+-K' is malformed: the '-' opens the key token, so the key reads as '-K' and fails.
    expect(normalizeAccelerator('Ctrl+-K')).toBeNull();
  });

  it('produces stable output (idempotent)', () => {
    const once = normalizeAccelerator('ctrl+shift+k');
    const twice = normalizeAccelerator(once!);
    expect(once).toBe(twice);
  });

  it('breaks the Control / CommandOrControl tie deterministically regardless of input order', () => {
    // CommandOrControl has its own ordinal (after Super), so the two orderings collapse to one form.
    expect(normalizeAccelerator('CommandOrControl+Control+K')).toBe('Control+CommandOrControl+K');
    expect(normalizeAccelerator('Control+CommandOrControl+K')).toBe('Control+CommandOrControl+K');
  });
});

describe('parseAccelerator', () => {
  it('parses a simple accelerator into modifiers and key', () => {
    const out = createParsedAccelerator();
    const result = parseAccelerator('Control+Shift+K', out);
    expect(result).toBe(out);
    expect(out.key).toBe('K');
    expect(out.modifiers).toEqual(['Control', 'Shift']);
  });

  it('resolves modifier aliases (canonical order: Alt before Meta)', () => {
    const out = createParsedAccelerator();
    parseAccelerator('Cmd+Option+S', out);
    expect(out.key).toBe('S');
    // Canonical order: Control < Alt < Shift < Meta < Super
    expect(out.modifiers).toEqual(['Alt', 'Meta']);
  });

  it('returns null on failure', () => {
    const out = createParsedAccelerator();
    expect(parseAccelerator('', out)).toBeNull();
    expect(parseAccelerator('Control+', out)).toBeNull();
    expect(parseAccelerator('Control+BadKey999', out)).toBeNull();
  });

  it('does not mutate out on failure', () => {
    const out = createParsedAccelerator();
    void out.key; // just read to confirm it exists before parsing
    parseAccelerator('', out);
    expect(out.key).toBe('');
    expect(out.modifiers).toEqual([]);
  });

  it('fills the modifiers array in place, keeping a retained reference live', () => {
    const out = createParsedAccelerator();
    const modifiers = out.modifiers;
    parseAccelerator('Control+Shift+K', out);
    expect(out.modifiers).toBe(modifiers);
    expect(modifiers).toEqual(['Control', 'Shift']);
    parseAccelerator('Alt+F', out);
    expect(out.modifiers).toBe(modifiers);
    expect(modifiers).toEqual(['Alt']);
  });

  it('clears stale modifiers when the new chord has fewer', () => {
    const out = createParsedAccelerator();
    parseAccelerator('Control+Alt+Shift+K', out);
    parseAccelerator('K', out);
    expect(out.modifiers).toEqual([]);
  });

  it('aliased out — same object as a previously-filled value', () => {
    const out = createParsedAccelerator();
    parseAccelerator('Ctrl+K', out);
    // Re-use out as input source (simulate aliased call)
    const result2 = parseAccelerator('Alt+F', out);
    expect(result2).toBe(out);
    expect(out.key).toBe('F');
    expect(out.modifiers).toEqual(['Alt']);
  });

  it('parses all modifier aliases correctly', () => {
    const cases: [string, ShortcutModifier][] = [
      ['Ctrl', 'Control'],
      ['Control', 'Control'],
      ['Cmd', 'Meta'],
      ['Command', 'Meta'],
      ['Meta', 'Meta'],
      ['Option', 'Alt'],
      ['Alt', 'Alt'],
      ['Shift', 'Shift'],
      ['Win', 'Super'],
      ['Super', 'Super'],
    ];
    for (const [alias, expected] of cases) {
      const out = createParsedAccelerator();
      const result = parseAccelerator(`${alias}+K`, out);
      expect(result).not.toBeNull();
      expect(out.modifiers).toContain(expected);
    }
  });
});

describe('parseAcceleratorDetailed', () => {
  it('returns the filled out on success', () => {
    const out = createParsedAccelerator();
    const result = parseAcceleratorDetailed('Control+K', out);
    expect(result).toBe(out);
    expect((result as ParsedAccelerator).key).toBe('K');
  });

  it('returns AcceleratorParseError with reason empty for empty input', () => {
    const out = createParsedAccelerator();
    const result = parseAcceleratorDetailed('', out);
    expect((result as AcceleratorParseError).reason).toBe('empty');
  });

  it('returns AcceleratorParseError with reason missing-key when only modifiers', () => {
    const out = createParsedAccelerator();
    const result = parseAcceleratorDetailed('Control+Shift', out);
    expect((result as AcceleratorParseError).reason).toBe('missing-key');
  });

  it('returns AcceleratorParseError with reason unknown-key for bad key', () => {
    const out = createParsedAccelerator();
    const result = parseAcceleratorDetailed('Control+InvalidKey999', out);
    const err = result as AcceleratorParseError;
    expect(err.reason).toBe('unknown-key');
    expect(err.token).toBe('InvalidKey999');
  });

  it('returns AcceleratorParseError with reason duplicate-modifier', () => {
    const out = createParsedAccelerator();
    const result = parseAcceleratorDetailed('Ctrl+Control+K', out);
    expect((result as AcceleratorParseError).reason).toBe('duplicate-modifier');
  });
});

describe('registerGlobalShortcut', () => {
  it('registers via the active backend with a normalized key', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(registerGlobalShortcut('Ctrl+Q', () => {})).toBe(true);
    // Stored normalized
    expect(backend.entries.has('Control+Q')).toBe(true);
  });

  it('fires the handler with a ShortcutEvent containing the accelerator', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    const received: string[] = [];
    registerGlobalShortcut('Control+K', (event) => received.push(event.accelerator));
    // Simulate trigger
    const entry = backend.entries.get('Control+K');
    entry?.handler({ accelerator: 'Control+K' });
    expect(received).toEqual(['Control+K']);
  });

  it('returns false on the web backend', () => {
    expect(registerGlobalShortcut('Control+Q', () => {})).toBe(false);
  });

  it('returns false for unparseable accelerator', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(registerGlobalShortcut('', () => {})).toBe(false);
    expect(registerGlobalShortcut('Bad###Key', () => {})).toBe(false);
  });
});

describe('resolveCommandOrControlModifier', () => {
  it('returns Control or Meta (never CommandOrControl)', () => {
    const result = resolveCommandOrControlModifier();
    expect(['Control', 'Meta']).toContain(result);
  });

  it('returns Meta on macOS via platform override', () => {
    expect(resolveCommandOrControlModifier('macos')).toBe('Meta');
    expect(resolveCommandOrControlModifier('MacOS')).toBe('Meta');
    expect(resolveCommandOrControlModifier('macintosh')).toBe('Meta');
  });

  it('returns Control on non-macOS via platform override', () => {
    expect(resolveCommandOrControlModifier('windows')).toBe('Control');
    expect(resolveCommandOrControlModifier('linux')).toBe('Control');
    expect(resolveCommandOrControlModifier('Windows NT')).toBe('Control');
  });
});

describe('resumeAllGlobalShortcuts', () => {
  it('re-enables all shortcuts after suspend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+K', () => {});
    suspendAllGlobalShortcuts();
    resumeAllGlobalShortcuts();
    expect(backend.allEnabled).toBe(true);
  });

  it('is a no-op on the web backend', () => {
    expect(() => resumeAllGlobalShortcuts()).not.toThrow();
  });
});

describe('setShortcutBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setShortcutBackend(fakeBackend());
    setShortcutBackend(null);
    expect(getShortcutBackend()).not.toBeNull();
    // Web backend sentinel
    expect(getRegisteredGlobalShortcuts()).toEqual([]);
  });
});

describe('setShortcutDropGuard', () => {
  it('reports an unparseable accelerator with the operation, the raw input, and the parse error', () => {
    setShortcutBackend(fakeBackend());
    const drops: ShortcutDrop[] = [];
    setShortcutDropGuard((drop) => drops.push({ ...drop }));
    expect(registerGlobalShortcut('Control+NotAKey', () => {})).toBe(false);
    expect(drops).toEqual([
      {
        accelerator: 'Control+NotAKey',
        operation: 'registerGlobalShortcut',
        parseError: { reason: 'unknown-key', token: 'NotAKey' },
        reason: 'unparseable',
      },
    ]);
  });

  it('names the operation each command dropped from', () => {
    const seen: string[] = [];
    setShortcutBackend(fakeBackend());
    setShortcutDropGuard((drop) => seen.push(drop.operation));
    disableGlobalShortcut('');
    enableGlobalShortcut('');
    registerGlobalShortcut('', () => {});
    unregisterGlobalShortcut('');
    expect(seen).toEqual([
      'disableGlobalShortcut',
      'enableGlobalShortcut',
      'registerGlobalShortcut',
      'unregisterGlobalShortcut',
    ]);
  });

  it('reports no-native-backend for a parseable chord on the web default, with no parse error', () => {
    const drops: ShortcutDrop[] = [];
    setShortcutDropGuard((drop) => drops.push({ ...drop }));
    registerGlobalShortcut('Control+K', () => {});
    expect(drops).toEqual([
      {
        accelerator: 'Control+K',
        operation: 'registerGlobalShortcut',
        parseError: null,
        reason: 'no-native-backend',
      },
    ]);
  });

  it('reports no-native-backend from the accelerator-free bulk commands too', () => {
    const seen: string[] = [];
    setShortcutDropGuard((drop) => seen.push(drop.operation));
    suspendAllGlobalShortcuts();
    resumeAllGlobalShortcuts();
    unregisterAllGlobalShortcuts();
    expect(seen).toEqual(['suspendAllGlobalShortcuts', 'resumeAllGlobalShortcuts', 'unregisterAllGlobalShortcuts']);
  });

  it('stays silent once a native backend is installed', () => {
    setShortcutBackend(fakeBackend());
    const drops: ShortcutDrop[] = [];
    setShortcutDropGuard((drop) => drops.push({ ...drop }));
    registerGlobalShortcut('Control+K', () => {});
    unregisterGlobalShortcut('Control+K');
    suspendAllGlobalShortcuts();
    expect(drops).toEqual([]);
  });

  it('reports the parse failure rather than the missing backend when both apply', () => {
    const drops: ShortcutDrop[] = [];
    setShortcutDropGuard((drop) => drops.push({ ...drop }));
    registerGlobalShortcut('Control+NotAKey', () => {});
    expect(drops.length).toBe(1);
    expect(drops[0].reason).toBe('unparseable');
  });

  it('null uninstalls it', () => {
    const drops: ShortcutDrop[] = [];
    setShortcutDropGuard((drop) => drops.push({ ...drop }));
    setShortcutDropGuard(null);
    registerGlobalShortcut('Control+NotAKey', () => {});
    expect(drops).toEqual([]);
  });

  it('does not change what a command returns', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    setShortcutDropGuard(() => {});
    expect(registerGlobalShortcut('ctrl+k', () => {})).toBe(true);
    expect(backend.entries.has('Control+K')).toBe(true);
    expect(registerGlobalShortcut('Control+NotAKey', () => {})).toBe(false);
  });
});

describe('suspendAllGlobalShortcuts', () => {
  it('disables all registered shortcuts', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+K', () => {});
    registerGlobalShortcut('Meta+S', () => {});
    suspendAllGlobalShortcuts();
    expect(backend.allEnabled).toBe(false);
    for (const entry of backend.entries.values()) {
      expect(entry.enabled).toBe(false);
    }
  });

  it('is a no-op on the web backend', () => {
    expect(() => suspendAllGlobalShortcuts()).not.toThrow();
  });
});

describe('unregisterAllGlobalShortcuts', () => {
  it('clears every shortcut via the active backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+A', () => {});
    registerGlobalShortcut('Control+B', () => {});
    unregisterAllGlobalShortcuts();
    expect(backend.entries.size).toBe(0);
  });

  it('is a no-op on the web backend', () => {
    expect(() => unregisterAllGlobalShortcuts()).not.toThrow();
  });
});

describe('unregisterGlobalShortcut', () => {
  it('unregisters via the active backend', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Control+W', () => {});
    expect(unregisterGlobalShortcut('Control+W')).toBe(true);
    expect(backend.entries.has('Control+W')).toBe(false);
  });

  it('normalizes before unregistering — alias spellings work', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    registerGlobalShortcut('Ctrl+W', () => {});
    expect(unregisterGlobalShortcut('control+w')).toBe(true);
    expect(backend.entries.size).toBe(0);
  });

  it('returns false on the web backend', () => {
    expect(unregisterGlobalShortcut('Control+W')).toBe(false);
  });

  it('returns false for unparseable accelerator', () => {
    const backend = fakeBackend();
    setShortcutBackend(backend);
    expect(unregisterGlobalShortcut('')).toBe(false);
  });
});
