import type { ShortcutModifier } from '@flighthq/types/contract';

import {
  equalsAccelerator,
  findAcceleratorConflict,
  formatAcceleratorForDisplay,
  getAcceleratorKey,
  getAcceleratorKeyLabel,
  getAcceleratorModifierLabel,
  getAcceleratorModifiers,
  isAcceleratorValid,
  makeParsedAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  parseAcceleratorDetailed,
  resolveCommandOrControlModifier,
} from './shortcut';

describe('equalsAccelerator', () => {
  it('compares normalized chord identity and rejects malformed input', () => {
    expect(equalsAccelerator('shift+ctrl+k', 'Control+Shift+K')).toBe(true);
    expect(equalsAccelerator('Control+K', 'Alt+K')).toBe(false);
    expect(equalsAccelerator('', '')).toBe(false);
  });
});

describe('findAcceleratorConflict', () => {
  it('returns the first caller-spelled normalized match', () => {
    expect(findAcceleratorConflict('Control+K', ['Alt+J', 'ctrl-k', 'Control-K'])).toBe('ctrl-k');
    expect(findAcceleratorConflict('Control+NotAKey', ['Control+NotAKey'])).toBeNull();
  });
});

describe('formatAcceleratorForDisplay', () => {
  it('requires the injected platform for CommandOrControl and display formatting', () => {
    expect(formatAcceleratorForDisplay('CommandOrControl+Shift+K', 'macos')).toBe('⇧⌘K');
    expect(formatAcceleratorForDisplay('CommandOrControl+Shift+K', 'windows')).toBe('Shift+Ctrl+K');
    expect(formatAcceleratorForDisplay('Control+NotAKey', 'linux')).toBe('');
  });
});

describe('getAcceleratorKey', () => {
  it('returns canonical keys only for parseable chords', () => {
    expect(getAcceleratorKey('Ctrl+Esc')).toBe('Escape');
    expect(getAcceleratorKey('Control+NotAKey')).toBeNull();
  });
});

describe('getAcceleratorKeyLabel', () => {
  it('maps special keys and preserves ordinary keys', () => {
    expect(getAcceleratorKeyLabel('ArrowUp')).toBe('↑');
    expect(getAcceleratorKeyLabel('K')).toBe('K');
  });
});

describe('getAcceleratorModifierLabel', () => {
  it('formats modifiers only against the injected platform', () => {
    expect(getAcceleratorModifierLabel('CommandOrControl', 'macos')).toBe('⌘');
    expect(getAcceleratorModifierLabel('CommandOrControl', 'linux')).toBe('Ctrl');
    expect(getAcceleratorModifierLabel('Alt', 'windows')).toBe('Alt');
  });
});

describe('getAcceleratorModifiers', () => {
  it('rewrites the caller-owned output and preserves it on parse failure', () => {
    const out: ShortcutModifier[] = ['Meta'];
    expect(getAcceleratorModifiers('Shift+Ctrl+K', out)).toBe(out);
    expect(out).toEqual(['Control', 'Shift']);
    expect(getAcceleratorModifiers('NotAKey', out)).toBeNull();
    expect(out).toEqual(['Control', 'Shift']);
  });
});

describe('isAcceleratorValid', () => {
  it('reports parser validity without consulting a provider', () => {
    expect(isAcceleratorValid('CommandOrControl+K')).toBe(true);
    expect(isAcceleratorValid('CommandOrControl+NotAKey')).toBe(false);
  });
});

describe('makeParsedAccelerator', () => {
  it('creates a zeroed mutable parse value rather than an Entity', () => {
    expect(makeParsedAccelerator()).toEqual({ key: '', modifiers: [] });
  });
});

describe('normalizeAccelerator', () => {
  it('canonicalizes modifier order, aliases, separators, and special keys', () => {
    expect(normalizeAccelerator('shift-ctrl-esc')).toBe('Control+Shift+Escape');
    expect(normalizeAccelerator('CommandOrControl++')).toBe('CommandOrControl+Plus');
    expect(normalizeAccelerator('')).toBeNull();
  });
});

describe('parseAccelerator', () => {
  it('fills a caller-owned value without replacing its modifiers array', () => {
    const out = makeParsedAccelerator();
    const modifiers = out.modifiers;
    expect(parseAccelerator('Shift+Ctrl+K', out)).toBe(out);
    expect(out).toEqual({ key: 'K', modifiers: ['Control', 'Shift'] });
    expect(out.modifiers).toBe(modifiers);
  });
});

describe('parseAcceleratorDetailed', () => {
  it('returns token-specific parse errors and leaves the output untouched', () => {
    const out = makeParsedAccelerator();
    expect(parseAcceleratorDetailed('Control+NotAKey', out)).toEqual({
      reason: 'unknown-key',
      token: 'NotAKey',
    });
    expect(out).toEqual({ key: '', modifiers: [] });
  });
});

describe('resolveCommandOrControlModifier', () => {
  it('resolves only from injected platform truth', () => {
    expect(resolveCommandOrControlModifier('macos')).toBe('Meta');
    expect(resolveCommandOrControlModifier('windows')).toBe('Control');
    expect(resolveCommandOrControlModifier('unknown')).toBe('Control');
  });
});
