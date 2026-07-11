import { createCapacitorGeolocationBackend } from './capacitorGeolocation';
import type { CapacitorApi, CapacitorPosition } from './capacitorModule';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function samplePosition(): CapacitorPosition {
  return {
    timestamp: 1234,
    coords: {
      latitude: 37.5,
      longitude: -122.3,
      accuracy: 5,
      altitude: 10,
      altitudeAccuracy: 2,
      heading: 90,
      speed: 1.5,
    },
  };
}

function fakeCapacitor(permission = 'granted') {
  const cleared: string[] = [];
  let watchCallback: ((position: CapacitorPosition | null, err?: unknown) => void) | null = null;
  const capacitor = {
    geolocation: {
      async getCurrentPosition() {
        return samplePosition();
      },
      async watchPosition(_options: unknown, callback: (position: CapacitorPosition | null, err?: unknown) => void) {
        watchCallback = callback;
        return 'watch-abc';
      },
      async clearWatch(options: { id: string }) {
        cleared.push(options.id);
      },
      async checkPermissions() {
        return { location: permission };
      },
      async requestPermissions() {
        return { location: permission };
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, cleared, fire: (p: CapacitorPosition) => watchCallback?.(p) };
}

describe('createCapacitorGeolocationBackend', () => {
  it('maps a Capacitor position onto a GeoPosition', async () => {
    const backend = createCapacitorGeolocationBackend(fakeCapacitor().capacitor);
    const position = await backend.getCurrentPosition({});
    expect(position).toMatchObject({ latitude: 37.5, longitude: -122.3, accuracy: 5, heading: 90, floorLevel: 0 });
  });

  it('maps permission state', async () => {
    const backend = createCapacitorGeolocationBackend(fakeCapacitor('denied').capacitor);
    expect(await backend.getPermission()).toBe('denied');
    expect(await backend.requestPermission()).toBe(false);
  });

  it('bridges the numeric watch id and clears the resolved string id', async () => {
    const { capacitor, cleared, fire } = fakeCapacitor();
    const backend = createCapacitorGeolocationBackend(capacitor);
    let received = 0;
    const id = backend.watchPosition(() => received++, {});
    expect(typeof id).toBe('number');
    await flush();
    fire(samplePosition());
    expect(received).toBe(1);
    backend.clearWatch(id);
    expect(cleared).toContain('watch-abc');
  });
});
