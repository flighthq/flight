import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
        launch: (() => {
          const out = allocateEntity<unknown>();
          out.getLaunchUrl = getLaunchUrl;
          return finishEntity(out);
        })(),
        registration: (() => {
          const out = allocateEntity<unknown>();
          out.getRegisteredSchemes = () => ['flight'];
          out.register = register;
          return finishEntity(out);
        })(),
      },
    };

    expect(Reflect.apply(registerProtocolScheme, undefined, [host, 'flight'])).toBe(true);
    expect(Reflect.apply(getProtocolLaunchUrl, undefined, [host])).toBe('flight://cold-start');
    expect(register).toHaveBeenCalledExactlyOnceWith('flight');
    expect(getLaunchUrl).toHaveBeenCalledOnce();
  });

  it('takes the live-open provider from Host and publishes an Entity', () => {
    const listeners: { open?: (url: string) => void } = {};
    const subscribe = vi.fn((listener: (url: string) => void) => {
      listeners.open = listener;
      return vi.fn();
    });
    const host = {
      protocol: {
        open: (() => {
          const out = allocateEntity<unknown>();
          out.subscribe = subscribe;
          return finishEntity(out);
        })(),
      },
    };
    const handler = createProtocolHandler();
    let received = '';
    connectSignal(handler.onOpenUrl, (url) => (received = url));

    Reflect.apply(attachProtocolHandler, undefined, [host, handler]);
    listeners.open?.('flight://warm-open');

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
