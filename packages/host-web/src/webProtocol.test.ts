import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { createWebProtocolCapabilities } from './webProtocol';

describe('createWebProtocolCapabilities', () => {
  it('creates only launch and registration as Entities', () => {
    const capabilities = createWebProtocolCapabilities();
    expect(Object.keys(capabilities).sort()).toEqual(['launch', 'registration']);
    expect(EntityRuntimeKey in capabilities.launch).toBe(true);
    expect(EntityRuntimeKey in capabilities.registration).toBe(true);
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
