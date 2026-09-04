import { createScreenInfo } from '@flighthq/screen/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebScreenCapabilities, initializeWebScreenCapabilities } from './webScreen';

afterEach(() => vi.restoreAllMocks());

describe('createWebScreenCapabilities', () => {
  it('publishes four Entity-backed slots unconditionally', () => {
    const capabilities = createWebScreenCapabilities();
    expect(Object.keys(capabilities)).toEqual(['change', 'details', 'permissionChange', 'query']);
    for (const provider of Object.values(capabilities)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('removes the exact pointer handler and clears cursor state on repeatable destroy', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const capabilities = createWebScreenCapabilities();
    capabilities.query.getCursorPosition({ x: 0, y: 0 });
    const handler = add.mock.calls.find(([type]) => type === 'pointermove')?.[1];
    capabilities.query.destroy?.();
    capabilities.query.destroy?.();
    expect(remove).toHaveBeenCalledWith('pointermove', handler);
  });

  it('binds existing subscriptions to Screen Details after a successful request', async () => {
    const add = vi.fn();
    const details = {
      currentScreen: {} as any,
      screens: [],
      addEventListener: add,
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'getScreenDetails', {
      configurable: true,
      value: vi.fn().mockResolvedValue(details),
    });
    const capabilities = createWebScreenCapabilities();
    capabilities.change.subscribe(vi.fn());
    expect(await capabilities.details.request()).toBe(true);
    expect(add).toHaveBeenCalledWith('screenschange', expect.any(Function));
    delete (window as any).getScreenDetails;
  });

  it('keeps permission/details operations present when browser APIs are absent', async () => {
    const capabilities = createWebScreenCapabilities();
    expect(await capabilities.details.request()).toBe(false);
    expect(['denied', 'granted', 'prompt']).toContain(await capabilities.details.queryPermission());
    expect(capabilities.permissionChange.subscribe(vi.fn())).toEqual(expect.any(Function));
  });

  it('retains the landscape fallback when the standard orientation property is absent at runtime', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window.screen, 'orientation');
    Object.defineProperty(window.screen, 'orientation', { configurable: true, value: undefined });
    try {
      const out = createWebScreenCapabilities().query.getPrimaryScreen(createScreenInfo());
      expect(out.orientation).toBe('Landscape');
      expect(out.rotation).toBe(-1);
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(window.screen, 'orientation');
      else Object.defineProperty(window.screen, 'orientation', descriptor);
    }
  });
});
describe('initializeWebScreenCapabilities', () => {
  it('is the construction initializer of createWebScreenCapabilities', () => {
    expect(typeof initializeWebScreenCapabilities).toBe('function');
  });
});
