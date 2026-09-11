import type { CapacitorApi, CapacitorConnectionStatus, ConnectivityStatus } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  capacitorHostConnectivity,
  capacitorHostConnectivityChange,
  capacitorHostConnectivityStatus,
} from './capacitorConnectivity';

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

describe('capacitorHostConnectivity', () => {
  it('returns one Entity and reports unknown before the async status is ready', () => {
    const fake = fakeCapacitor();
    const connectivity = capacitorHostConnectivity(fake.capacitor);
    expect(connectivity.change).toBe(connectivity.status);
    expect(EntityRuntimeKey in connectivity.status).toBe(true);
    expect(connectivity.status.getStatus(status())).toEqual({
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
    const hostConnectivityChange = capacitorHostConnectivity(fake.capacitor).change;
    let a = 0;
    let b = 0;
    const releaseA = hostConnectivityChange.subscribe(() => a++);
    hostConnectivityChange.subscribe(() => b++);
    expect(fake.addListenerCalls()).toBe(1);
    fake.fire({ connected: true, connectionType: 'wifi' });
    expect([a, b]).toEqual([1, 1]);
    releaseA?.();
    fake.fire({ connected: false, connectionType: 'none' });
    expect([a, b]).toEqual([1, 2]);
  });

  it('notifies subscribers when the initial unknown status becomes measured', async () => {
    const fake = fakeCapacitor();
    const connectivity = capacitorHostConnectivity(fake.capacitor);
    let changes = 0;
    connectivity.change.subscribe(() => changes++);
    fake.resolveInitial({ connected: true, connectionType: 'wifi' });
    await flush();
    expect(changes).toBe(1);
    expect(connectivity.status.getStatus(status())).toMatchObject({ online: true, type: 'wifi' });
  });

  it('does not let a late initial query overwrite a newer native event', async () => {
    const fake = fakeCapacitor();
    const hostConnectivityStatus = capacitorHostConnectivity(fake.capacitor).status;
    fake.fire({ connected: false, connectionType: 'none' });
    fake.resolveInitial({ connected: true, connectionType: 'wifi' });
    await flush();
    expect(hostConnectivityStatus.getStatus(status())).toMatchObject({ online: false, type: 'none' });
  });

  it('destroy-before-handle-resolution removes the exact handle once and clears fanout', async () => {
    const fake = fakeCapacitor();
    const hostConnectivityChange = capacitorHostConnectivity(fake.capacitor).change;
    let changes = 0;
    hostConnectivityChange.subscribe(() => changes++);
    hostConnectivityChange.destroy();
    hostConnectivityChange.destroy();
    expect(hostConnectivityChange.subscribe(() => {})).toBeNull();
    fake.fire({ connected: true, connectionType: 'wifi' });
    expect(changes).toBe(0);
    expect(fake.removals()).toBe(0);
    fake.resolveHandle();
    await flush();
    expect(fake.removals()).toBe(1);
  });
});

describe('capacitorHostConnectivityChange', () => {
  it('constructs an Entity-backed change provider', () => {
    expect(EntityRuntimeKey in capacitorHostConnectivityChange(fakeCapacitor().capacitor)).toBe(true);
  });
});

describe('capacitorHostConnectivityStatus', () => {
  it('constructs an Entity-backed status provider', () => {
    expect(EntityRuntimeKey in capacitorHostConnectivityStatus(fakeCapacitor().capacitor)).toBe(true);
  });
});
