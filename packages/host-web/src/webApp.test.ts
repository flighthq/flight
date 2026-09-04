import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  createWebAppCapabilities,
  initializeWebAppBadgeBackend,
  initializeWebAppCapabilities,
  initializeWebAppFocusBackend,
  initializeWebAppLocaleBackend,
  initializeWebAppNameBackend,
  initializeWebAppQuitBackend,
  initializeWebAppReadyBackend,
  initializeWebAppRelaunchBackend,
} from './webApp';

describe('createWebAppCapabilities', () => {
  it('creates the exact genuine web app slots as Entities', () => {
    const capabilities = createWebAppCapabilities();
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual(['badge', 'focus', 'locale', 'name', 'quit', 'ready', 'relaunch']);
    for (const backend of Object.values(capabilities)) expect(EntityRuntimeKey in backend).toBe(true);
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

describe('initializeWebAppCapabilities', () => {
  it('is the construction initializer of createWebAppCapabilities', () => {
    expect(typeof initializeWebAppCapabilities).toBe('function');
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
