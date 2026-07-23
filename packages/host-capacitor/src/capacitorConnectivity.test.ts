import type { ConnectivityStatus, CapacitorApi, CapacitorConnectionStatus } from '@flighthq/types';

import { createCapacitorConnectivityBackend } from './capacitorConnectivity';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function emptyStatus(): ConnectivityStatus {
  return {
    online: false,
    type: 'unknown',
    downlink: 0,
    downlinkMax: 0,
    effectiveType: 'x',
    rtt: 0,
    saveData: true,
    metered: false,
  };
}

function fakeCapacitor(initial: CapacitorConnectionStatus = { connected: true, connectionType: 'wifi' }) {
  const listeners: Array<(status: CapacitorConnectionStatus) => void> = [];
  const capacitor = {
    network: {
      async getStatus() {
        return initial;
      },
      async addListener(_eventName: string, listener: (status: CapacitorConnectionStatus) => void) {
        listeners.push(listener);
        return { async remove() {} };
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, fire: (status: CapacitorConnectionStatus) => listeners.forEach((l) => l(status)) };
}

describe('createCapacitorConnectivityBackend', () => {
  it('fills the out snapshot from the prefetched status', async () => {
    const backend = createCapacitorConnectivityBackend(fakeCapacitor().capacitor);
    await flush();
    const status = backend.getStatus(emptyStatus());
    expect(status.online).toBe(true);
    expect(status.type).toBe('wifi');
    expect(status.downlink).toBe(-1);
    expect(status.metered).toBe(false);
  });

  it('reflects a networkStatusChange in the mirror and to subscribers', async () => {
    const { capacitor, fire } = fakeCapacitor();
    const backend = createCapacitorConnectivityBackend(capacitor);
    await flush();
    let changes = 0;
    backend.subscribe(() => changes++);
    await flush();
    fire({ connected: true, connectionType: 'cellular' });
    expect(changes).toBe(1);
    const status = backend.getStatus(emptyStatus());
    expect(status.type).toBe('cellular');
    expect(status.metered).toBe(true);
  });
});
