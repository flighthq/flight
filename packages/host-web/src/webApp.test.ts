import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { createWebAppCapabilities } from './webApp';

describe('createWebAppCapabilities', () => {
  it('creates the exact genuine web app slots as Entities', () => {
    const capabilities = createWebAppCapabilities();
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
