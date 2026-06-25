import { clearSignal, connectSignal } from '@flighthq/signals';
import type {
  AcceleratorParseError,
  ParsedAccelerator,
  ShortcutBackend,
  ShortcutEvent,
  ShortcutModifier,
} from '@flighthq/types';

import {
  areAcceleratorsEqual,
  createParsedAccelerator,
  createWebShortcutBackend,
  disableGlobalShortcut,
  enableGlobalShortcut,
  enableGlobalShortcutSignals,
  formatAcceleratorForDisplay,
  getAcceleratorKey,
  getAcceleratorKeyLabel,
  getAcceleratorModifierLabel,
  getAcceleratorModifiers,
  getRegisteredGlobalShortcuts,
  getShortcutBackend,
  hasGlobalShortcutConflict,
  isAcceleratorValid,
  isGlobalShortcutRegistered,
  normalizeAccelerator,
  parseAccelerator,
  parseAcceleratorDetailed,
  registerGlobalShortcut,
  resolveCommandOrControlModifier,
  resumeAllGlobalShortcuts,
  setShortcutBackend,
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
  // Disconnect any signal listeners registered in this test to avoid cross-test bleed.
  const signals = enableGlobalShortcutSignals();
  clearSignal(signals.onTrigger);
});

describe('areAcceleratorsEqual', () => {
  it('returns true for same chord in different spellings', () => {
    expect(areAcceleratorsEqual('Ctrl+K', 'Control+K')).toBe(true);
    expect(areAcceleratorsEqual('Cmd+Shift+S', 'Meta+Shift+S')).toBe(true);
    expect(areAcceleratorsEqual('ctrl+shift+k', 'Control+Shift+K')).toBe(true);
  });

  it('returns false for different chords', () => {
    expect(areAcceleratorsEqual('Ctrl+K', 'Ctrl+S')).toBe(false);
    expect(areAcceleratorsEqual('Ctrl+K', 'Alt+K')).toBe(false);
  });

  it('returns false when either accelerator is unparseable', () => {
    expect(areAcceleratorsEqual('', 'Ctrl+K')).toBe(false);
    expect(areAcceleratorsEqual('Ctrl+K', 'bad###key')).toBe(false);
    expect(areAcceleratorsEqual('', '')).toBe(false);
  });

  it('is order-insensitive for modifiers', () => {
    expect(areAcceleratorsEqual('Shift+Ctrl+K', 'Control+Shift+K')).toBe(true);
    expect(areAcceleratorsEqual('Alt+Shift+Control+K', 'Ctrl+Shift+Alt+K')).toBe(true);
  });
});

describe('createParsedAccelerator', () => {
  it('returns a zeroed ParsedAccelerator', () => {
    const out = createParsedAccelerator();
    expect(out.key).toBe('');
    expect(out.modifiers).toEqual([]);
  });
});

describe('createWebShortcutBackend', () => {
  it('returns sentinels without throwing (web has no global hotkeys)', () => {
    const backend = createWebShortcutBackend();
    expect(backend.register('Control+K', () => {})).toBe(false);
    expect(backend.unregister('Control+K')).toBe(false);
    expect(backend.isRegistered('Control+K')).toBe(false);
    expect(backend.setEnabled('Control+K', false)).toBe(false);
    expect(backend.getRegistered()).toEqual([]);
    expect(() => backend.unregisterAll()).not.toThrow();
    expect(() => backend.setAllEnabled(false)).not.toThrow();
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
