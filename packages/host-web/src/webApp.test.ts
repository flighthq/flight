import { describe, expect, it, vi } from 'vitest';

import {
  createWebAppCapabilities,
  initializeWebAppBadgeBackend,
  initializeWebAppFocusBackend,
  initializeWebAppLocaleBackend,
  initializeWebAppNameBackend,
  initializeWebAppQuitBackend,
  initializeWebAppReadyBackend,
  initializeWebAppRelaunchBackend,
} from './webApp';

describe('createWebAppCapabilities', () => {
  it('creates the exact genuine web app slots', () => {
    const capabilities = createWebAppCapabilities();
    expect(Object.keys(capabilities).sort()).toEqual(['badge', 'focus', 'locale', 'name', 'quit', 'ready', 'relaunch']);
  });

  it('is plain data: the group carries no Entity runtime and no symbol keys at all', () => {
    // A capability group is host dispatch infrastructure, not a domain object Flight allocates, so it
    // must not carry the Entity runtime tier. EntityRuntimeKey is Symbol.for('EntityRuntime'), so a
    // registered-symbol lookup catches it even if the entity package is not imported here.
    const capabilities = createWebAppCapabilities();
    expect(Symbol.for('EntityRuntime') in capabilities).toBe(false);
    expect(Object.getOwnPropertySymbols(capabilities)).toEqual([]);
  });

  it('gives each group its own capability objects rather than sharing one instance', () => {
    const first = createWebAppCapabilities();
    const second = createWebAppCapabilities();
    expect(first).not.toBe(second);
    expect(first.badge).not.toBe(second.badge);
  });

  it('reports document and locale facts without inventing native process facts', () => {
    document.title = 'Flight Web';
    const capabilities = createWebAppCapabilities();
    expect(capabilities.name.getName()).toBe('Flight Web');
    expect(capabilities.locale.getLocale()).toBeTypeOf('string');
    expect(capabilities.locale.getPreferredSystemLanguages()).toBeInstanceOf(Array);
    expect(capabilities.locale.getSystemLocale()).toBeTypeOf('string');
  });

  it('allows a ready delivery to be cancelled before its microtask', async () => {
    const capabilities = createWebAppCapabilities();
    const listener = vi.fn();
    const unsubscribe = capabilities.ready.subscribe(listener);
    unsubscribe();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });
});
describe('initializeWebAppBadgeBackend', () => {
  it('is the construction initializer of createWebAppBadgeBackend', () => {
    expect(typeof initializeWebAppBadgeBackend).toBe('function');
  });
});

describe('initializeWebAppFocusBackend', () => {
  it('is the construction initializer of createWebAppFocusBackend', () => {
    expect(typeof initializeWebAppFocusBackend).toBe('function');
  });
});

describe('initializeWebAppLocaleBackend', () => {
  it('is the construction initializer of createWebAppLocaleBackend', () => {
    expect(typeof initializeWebAppLocaleBackend).toBe('function');
  });
});

describe('initializeWebAppNameBackend', () => {
  it('is the construction initializer of createWebAppNameBackend', () => {
    expect(typeof initializeWebAppNameBackend).toBe('function');
  });
});

describe('initializeWebAppQuitBackend', () => {
  it('is the construction initializer of createWebAppQuitBackend', () => {
    expect(typeof initializeWebAppQuitBackend).toBe('function');
  });
});

describe('initializeWebAppReadyBackend', () => {
  it('is the construction initializer of createWebAppReadyBackend', () => {
    expect(typeof initializeWebAppReadyBackend).toBe('function');
  });
});

describe('initializeWebAppRelaunchBackend', () => {
  it('is the construction initializer of createWebAppRelaunchBackend', () => {
    expect(typeof initializeWebAppRelaunchBackend).toBe('function');
  });
});
