import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  HostGeolocationProvider,
  GeolocationErrorReason,
  GeolocationPosition,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  clearGeolocationWatch,
  createGeolocationPosition,
  createWebGeolocationBackend,
  getCurrentGeolocationPosition,
  getCurrentGeolocationPositionResult,
  initializeGeolocationPosition,
  initializeWebGeolocationBackend,
  isGeolocationAvailable,
  watchGeolocationPosition,
} from './geolocation';

function fakeBackend(available: boolean = true): HostGeolocationProvider & { cleared: number[]; lastWatch: number } {
  const out = allocateEntity<any>();
  out.cleared = [];
  out.lastWatch = 0;
  out.promptForAccess = () => Promise.resolve({ reason: 'granted' as const });
  out.clearWatch = (id: number) => {
    out.cleared.push(id);
  };
  out.getCurrentPosition = async () => {
    const position = createGeolocationPosition();
    position.latitude = 1;
    position.longitude = 2;
    return position;
  };
  out.getCurrentPositionResult = async () => {
    const position = createGeolocationPosition();
    position.latitude = 1;
    position.longitude = 2;
    return { position, reason: null };
  };
  out.isAvailable = () => {
    return available;
  };
  out.watchPosition = (
    listener: (position: GeolocationPosition) => void,
    _options: Record<string, unknown>,
    onError?: (reason: GeolocationErrorReason) => void,
  ) => {
    const position = createGeolocationPosition();
    position.latitude = 3;
    listener(position);
    if (onError) onError('denied');
    return ++out.lastWatch;
  };
  return finishEntity(out);
}

function hostWith(backend: HostGeolocationProvider): {
  readonly system: { readonly geolocation: HostGeolocationProvider };
} {
  return { system: { geolocation: backend } } as { readonly system: { readonly geolocation: HostGeolocationProvider } };
}

describe('clearGeolocationWatch', () => {
  it('forwards the id to the host backend', () => {
    const backend = fakeBackend();
    clearGeolocationWatch(hostWith(backend).system.geolocation, 7);
    expect(backend.cleared).toEqual([7]);
  });
});

describe('createGeolocationPosition', () => {
  it('allocates a zeroed position', () => {
    const position = createGeolocationPosition();
    expect(Object.hasOwn(position, EntityRuntimeKey)).toBe(true);
    expect(position).toMatchObject({
      accuracy: 0,
      altitude: 0,
      altitudeAccuracy: 0,
      floorLevel: 0,
      heading: 0,
      latitude: 0,
      longitude: 0,
      speed: 0,
      timestamp: 0,
    });
  });
});

describe('createWebGeolocationBackend', () => {
  it('resolves null and does not throw when geolocation is absent', async () => {
    const backend = createWebGeolocationBackend();
    expect(await backend.getCurrentPosition({})).toBeNull();
    expect(typeof backend.watchPosition(() => {}, {})).toBe('number');
    expect(() => backend.clearWatch(-1)).not.toThrow();
  });

  it('getCurrentPositionResult returns unavailable reason when geolocation is absent', async () => {
    const backend = createWebGeolocationBackend();
    const result = await backend.getCurrentPositionResult({});
    expect(result.position).toBeNull();
    expect(result.reason).toBe('unavailable');
  });

  it('reads a host-provided floorLevel from coords', async () => {
    const hadOwn = Object.prototype.hasOwnProperty.call(navigator, 'geolocation');
    const original =
      Object.getOwnPropertyDescriptor(navigator, 'geolocation') ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: (position: unknown) => void) {
          success({
            coords: {
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              floorLevel: 3,
              heading: null,
              latitude: 1,
              longitude: 2,
              speed: null,
            },
            timestamp: 123,
          });
        },
      },
    });
    try {
      const backend = createWebGeolocationBackend();
      const position = await backend.getCurrentPosition({});
      expect(position?.floorLevel).toBe(3);
    } finally {
      if (hadOwn && original !== undefined) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as { geolocation?: unknown }).geolocation;
      }
    }
  });

  it('reports availability only when geolocation exists in a secure context', () => {
    const backend = createWebGeolocationBackend();
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', { isSecureContext: true });
    expect(backend.isAvailable()).toBe(true);

    vi.stubGlobal('window', { isSecureContext: false });
    expect(backend.isAvailable()).toBe(false);

    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { isSecureContext: true });
    expect(backend.isAvailable()).toBe(false);
  });

  afterEach(() => vi.unstubAllGlobals());
});

describe('getCurrentGeolocationPosition', () => {
  it('returns the backend position', async () => {
    const position = (await getCurrentGeolocationPosition(
      hostWith(fakeBackend()).system.geolocation,
    )) as GeolocationPosition;
    expect(position.latitude).toBe(1);
    expect(position.longitude).toBe(2);
  });
});

describe('getCurrentGeolocationPositionResult', () => {
  it('returns position and null reason on success', async () => {
    const result = await getCurrentGeolocationPositionResult(hostWith(fakeBackend()).system.geolocation);
    expect(result.position).not.toBeNull();
    expect(result.position!.latitude).toBe(1);
    expect(result.reason).toBeNull();
  });
});

describe('initializeGeolocationPosition', () => {
  it('is the construction initializer of createGeolocationPosition', () => {
    expect(typeof initializeGeolocationPosition).toBe('function');
  });
});

describe('initializeWebGeolocationBackend', () => {
  it('is the construction initializer of createWebGeolocationBackend', () => {
    expect(typeof initializeWebGeolocationBackend).toBe('function');
  });
});
describe('isGeolocationAvailable', () => {
  it('routes the host backend availability', () => {
    expect(isGeolocationAvailable(hostWith(fakeBackend(true)).system.geolocation)).toBe(true);
    expect(isGeolocationAvailable(hostWith(fakeBackend(false)).system.geolocation)).toBe(false);
  });
});

describe('watchGeolocationPosition', () => {
  it('delivers positions and returns a watch id', () => {
    let seen = 0;
    const id = watchGeolocationPosition(hostWith(fakeBackend()).system.geolocation, (position) => {
      seen = position.latitude;
    });
    expect(id).toBe(1);
    expect(seen).toBe(3);
  });

  it('delivers error reasons when onError is provided', () => {
    const errors: GeolocationErrorReason[] = [];
    watchGeolocationPosition(
      hostWith(fakeBackend()).system.geolocation,
      () => {},
      {},
      (reason) => errors.push(reason),
    );
    expect(errors).toEqual(['denied']);
  });
});
