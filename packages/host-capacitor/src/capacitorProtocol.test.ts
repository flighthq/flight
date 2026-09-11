import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { capacitorHostProtocol, capacitorHostProtocolOpen } from './capacitorProtocol';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('capacitorHostProtocol', () => {
  it('publishes only a live-open Entity and adapts appUrlOpen', async () => {
    let listener: ((event: { url: string }) => void) | undefined;
    let removed = 0;
    const capacitor = {
      app: {
        addListener: async (_name: string, next: (event: { url: string }) => void) => {
          listener = next;
          return {
            async remove() {
              removed++;
            },
          };
        },
      },
    } as unknown as CapacitorApi;
    const protocol = capacitorHostProtocol(capacitor);
    expect(EntityRuntimeKey in protocol).toBe(true);
    expect(Object.keys(protocol)).toEqual(['open']);
    expect(EntityRuntimeKey in protocol.open).toBe(true);
    let url = '';
    const off = protocol.open.subscribe((next) => (url = next));
    await flush();
    listener?.({ url: 'flight://open' });
    expect(url).toBe('flight://open');
    off();
    await flush();
    expect(removed).toBe(1);
  });
});

describe('capacitorHostProtocolOpen', () => {
  it('constructs the open provider as an Entity', () => {
    const capacitor = { app: { addListener: async () => ({ async remove() {} }) } } as unknown as CapacitorApi;
    expect(EntityRuntimeKey in capacitorHostProtocolOpen(capacitor)).toBe(true);
  });
});
