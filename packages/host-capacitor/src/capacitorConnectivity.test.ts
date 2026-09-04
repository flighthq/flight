import type { CapacitorApi, CapacitorConnectionStatus, ConnectivityStatus } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCapacitorConnectivityBackend, initializeCapacitorConnectivityBackend } from './capacitorConnectivity';

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function status(): ConnectivityStatus {
  return {
    downlink: 0,
    downlinkMax: 0,
    effectiveType: 'stale',
    metered: true,
    online: false,
    rtt: 0,
    saveData: true,
    type: 'cellular',
  };
}

function fakeCapacitor() {
  let nativeListener: ((value: CapacitorConnectionStatus) => void) | null = null;
  let resolveInitial!: (value: CapacitorConnectionStatus) => void;
  let resolveHandle!: (value: { remove(): Promise<void> }) => void;
  let addListenerCalls = 0;
  let removals = 0;
  const initial = new Promise<CapacitorConnectionStatus>((resolve) => {
    resolveInitial = resolve;
  });
  const handle = new Promise<{ remove(): Promise<void> }>((resolve) => {
    resolveHandle = resolve;
  });
  const capacitor = {
    network: {
      addListener(_event: string, listener: (value: CapacitorConnectionStatus) => void) {
        addListenerCalls++;
        nativeListener = listener;
        return handle;
      },
      getStatus() {
        return initial;
      },
    },
  } as unknown as CapacitorApi;
  return {
    addListenerCalls: () => addListenerCalls,
    capacitor,
    fire(value: CapacitorConnectionStatus) {
      nativeListener?.(value);
    },
    removals: () => removals,
    resolveHandle() {
      resolveHandle({
        async remove() {
          removals++;
        },
      });
    },
    resolveInitial,
  };
}

describe('createCapacitorConnectivityBackend', () => {
  it('returns one Entity and reports unknown before the async status is ready', () => {
    const fake = fakeCapacitor();
    const backend = createCapacitorConnectivityBackend(fake.capacitor);
    expect(EntityRuntimeKey in backend).toBe(true);
    expect(backend.getStatus(status())).toEqual({
      downlink: -1,
      downlinkMax: -1,
      effectiveType: '',
      metered: false,
      online: null,
      rtt: -1,
      saveData: false,
      type: 'unknown',
    });
  });

  it('uses one native listener for any number of local subscribers', () => {
    const fake = fakeCapacitor();
    const backend = createCapacitorConnectivityBackend(fake.capacitor);
    let a = 0;
    let b = 0;
    const releaseA = backend.subscribe(() => a++);
    backend.subscribe(() => b++);
    expect(fake.addListenerCalls()).toBe(1);
    fake.fire({ connected: true, connectionType: 'wifi' });
    expect([a, b]).toEqual([1, 1]);
    releaseA?.();
    fake.fire({ connected: false, connectionType: 'none' });
    expect([a, b]).toEqual([1, 2]);
  });

  it('notifies subscribers when the initial unknown status becomes measured', async () => {
    const fake = fakeCapacitor();
    const backend = createCapacitorConnectivityBackend(fake.capacitor);
    let changes = 0;
    backend.subscribe(() => changes++);
    fake.resolveInitial({ connected: true, connectionType: 'wifi' });
    await flush();
    expect(changes).toBe(1);
    expect(backend.getStatus(status())).toMatchObject({ online: true, type: 'wifi' });
  });

  it('does not let a late initial query overwrite a newer native event', async () => {
    const fake = fakeCapacitor();
    const backend = createCapacitorConnectivityBackend(fake.capacitor);
    fake.fire({ connected: false, connectionType: 'none' });
    fake.resolveInitial({ connected: true, connectionType: 'wifi' });
    await flush();
    expect(backend.getStatus(status())).toMatchObject({ online: false, type: 'none' });
  });

  it('destroy-before-handle-resolution removes the exact handle once and clears fanout', async () => {
    const fake = fakeCapacitor();
    const backend = createCapacitorConnectivityBackend(fake.capacitor);
    let changes = 0;
    backend.subscribe(() => changes++);
    backend.destroy();
    backend.destroy();
    expect(backend.subscribe(() => {})).toBeNull();
    fake.fire({ connected: true, connectionType: 'wifi' });
    expect(changes).toBe(0);
    expect(fake.removals()).toBe(0);
    fake.resolveHandle();
    await flush();
    expect(fake.removals()).toBe(1);
  });
});
describe('initializeCapacitorConnectivityBackend', () => {
  it('is the construction initializer of createCapacitorConnectivityBackend', () => {
    expect(typeof initializeCapacitorConnectivityBackend).toBe('function');
  });
});
