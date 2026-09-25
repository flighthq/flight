import { describe, expect, it, vi } from 'vitest';

import {
  createWebProtocolCapabilities,
  initializeWebProtocolLaunchBackend,
  initializeWebProtocolRegistrationBackend,
} from './webProtocol.ts';

describe('createWebProtocolCapabilities', () => {
  it('creates only launch and registration', () => {
    const capabilities = createWebProtocolCapabilities();
    expect(Object.keys(capabilities).sort()).toEqual(['launch', 'registration']);
  });

  it('is plain data: the group carries no Entity runtime and no symbol keys at all', () => {
    // A capability group is host dispatch infrastructure, not a domain object Flight allocates.
    // EntityRuntimeKey is Symbol.for('EntityRuntime'), so the registered-symbol lookup finds it even
    // without importing the entity package here.
    const capabilities = createWebProtocolCapabilities();
    expect(Symbol.for('EntityRuntime') in capabilities).toBe(false);
    expect(Object.getOwnPropertySymbols(capabilities)).toEqual([]);
  });

  it('keeps each group on its own registered-scheme list', () => {
    // The list moved from per-allocation state into the factory's closure; this pins that two groups
    // still do not share it.
    const first = createWebProtocolCapabilities();
    const second = createWebProtocolCapabilities();
    expect(first.registration.getRegisteredSchemes()).toEqual([]);
    expect(second.registration.getRegisteredSchemes()).toEqual([]);
    expect(first.registration).not.toBe(second.registration);
  });

  it('records only schemes submitted successfully by this provider', () => {
    const registerProtocolHandler = vi.fn();
    Object.defineProperty(navigator, 'registerProtocolHandler', { configurable: true, value: registerProtocolHandler });
    const capabilities = createWebProtocolCapabilities();
    expect(capabilities.registration.register('flight')).toBe(true);
    expect(capabilities.registration.getRegisteredSchemes()).toEqual(['flight']);
    expect(registerProtocolHandler).toHaveBeenCalledExactlyOnceWith('flight', location.origin + '/?url=%s');
  });
});
describe('initializeWebProtocolLaunchBackend', () => {
  it('is the construction initializer of createWebProtocolLaunchBackend', () => {
    expect(typeof initializeWebProtocolLaunchBackend).toBe('function');
  });
});

describe('initializeWebProtocolRegistrationBackend', () => {
  it('is the construction initializer of createWebProtocolRegistrationBackend', () => {
    expect(typeof initializeWebProtocolRegistrationBackend).toBe('function');
  });
});
