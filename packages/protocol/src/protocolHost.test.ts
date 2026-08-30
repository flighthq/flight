import { createEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as protocolContract from './contract';
import { attachProtocolHandler, createProtocolHandler, getProtocolLaunchUrl, registerProtocolScheme } from './protocol';

describe('protocol explicit Host ownership', () => {
  it('uses a promoted top-level protocol group for independent command and query slots', () => {
    const register = vi.fn(() => true);
    const getLaunchUrl = vi.fn(() => 'flight://cold-start');
    const host = {
      protocol: {
        launch: createEntity({ getLaunchUrl }),
        registration: createEntity({ getRegisteredSchemes: () => ['flight'], register }),
      },
    };

    expect(Reflect.apply(registerProtocolScheme, undefined, [host, 'flight'])).toBe(true);
    expect(Reflect.apply(getProtocolLaunchUrl, undefined, [host])).toBe('flight://cold-start');
    expect(register).toHaveBeenCalledExactlyOnceWith('flight');
    expect(getLaunchUrl).toHaveBeenCalledOnce();
  });

  it('takes the live-open provider from Host and publishes an Entity', () => {
    let open: ((url: string) => void) | null = null;
    const subscribe = vi.fn((listener: (url: string) => void) => {
      open = listener;
      return vi.fn();
    });
    const host = { protocol: { open: createEntity({ subscribe }) } };
    const handler = createProtocolHandler();
    let received = '';
    connectSignal(handler.onOpenUrl, (url) => (received = url));

    Reflect.apply(attachProtocolHandler, undefined, [host, handler]);
    open?.('flight://warm-open');

    expect(subscribe).toHaveBeenCalledOnce();
    expect(received).toBe('flight://warm-open');
    expect(EntityRuntimeKey in handler).toBe(true);
  });

  it('deletes the ambient resolver family instead of retaining a parallel API', () => {
    expect(protocolContract).not.toHaveProperty('explainProtocolBackend');
    expect(protocolContract).not.toHaveProperty('getProtocolBackend');
    expect(protocolContract).not.toHaveProperty('installProtocolHostBackend');
    expect(protocolContract).not.toHaveProperty('observeProtocolHostResult');
    expect(protocolContract).not.toHaveProperty('resetProtocolBackendForTest');
    expect(protocolContract).not.toHaveProperty('setProtocolBackend');
  });
});
