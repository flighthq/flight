import type { GeolocationAccessOutcome, HostGeolocationProvider } from '@flighthq/types/contract';

import { requestPermission } from './permission';

function geolocationProvider(outcome: GeolocationAccessOutcome, calls?: { count: number }): HostGeolocationProvider {
  return {
    promptForAccess: () => {
      if (calls !== undefined) calls.count += 1;
      return Promise.resolve(outcome);
    },
  } as unknown as HostGeolocationProvider;
}

describe('requestPermission', () => {
  it('projects a granted geolocation prompt to granted', async () => {
    expect(
      await requestPermission(undefined, undefined, geolocationProvider({ reason: 'granted' }), 'geolocation'),
    ).toEqual({
      reason: 'granted',
      state: 'granted',
    });
  });

  it('projects a denied geolocation prompt to denied', async () => {
    expect(
      await requestPermission(undefined, undefined, geolocationProvider({ reason: 'denied' }), 'geolocation'),
    ).toEqual({
      reason: 'denied',
      state: 'denied',
    });
  });

  it('projects a dismissed geolocation prompt to prompt', async () => {
    expect(
      await requestPermission(undefined, undefined, geolocationProvider({ reason: 'dismissed' }), 'geolocation'),
    ).toEqual({
      reason: 'dismissed',
      state: 'prompt',
    });
  });

  // ★ THE RULED BEHAVIOUR. A timeout is an ACQUISITION observable: it happens routinely with permission
  // already granted (indoors, no fix). It is not evidence of anything the user did, so Permissions must
  // carry it through as a reason and infer NO state. A caller that needs the state queries for it.
  it('preserves a geolocation timeout as a reason-only outcome with no state', async () => {
    const outcome = await requestPermission(
      undefined,
      undefined,
      geolocationProvider({ reason: 'timeout' }),
      'geolocation',
    );
    expect(outcome.reason).toBe('timeout');
    expect(Object.hasOwn(outcome, 'state')).toBe(false);
  });

  it('does not report a timeout as denied, dismissed or granted', async () => {
    const outcome = await requestPermission(
      undefined,
      undefined,
      geolocationProvider({ reason: 'timeout' }),
      'geolocation',
    );
    expect(['denied', 'dismissed', 'granted']).not.toContain(outcome.reason);
  });

  // cleanup-failed is Flight's own failure after access WAS obtained, so the decision survives it.
  it('keeps the granted decision when cleanup fails', async () => {
    expect(
      await requestPermission(undefined, undefined, geolocationProvider({ reason: 'cleanup-failed' }), 'geolocation'),
    ).toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
    });
  });

  it('asks the geolocation provider exactly once per request', async () => {
    const calls = { count: 0 };
    await requestPermission(undefined, undefined, geolocationProvider({ reason: 'granted' }, calls), 'geolocation');
    expect(calls.count).toBe(1);
  });

  it('does not consult the geolocation provider for another permission name', async () => {
    const calls = { count: 0 };
    await requestPermission(undefined, undefined, geolocationProvider({ reason: 'granted' }, calls), 'midi');
    expect(calls.count).toBe(0);
  });

  it('reports runtime-unavailable when no geolocation provider is installed', async () => {
    const outcome = await requestPermission(undefined, undefined, undefined, 'geolocation');
    expect(outcome).toEqual({ reason: 'runtime-unavailable' });
  });
});
