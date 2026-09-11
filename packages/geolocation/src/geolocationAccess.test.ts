import type { GeolocationAccessOutcome, HostGeolocationProvider } from '@flighthq/types/contract';

import { promptForGeolocationAccess } from './geolocationAccess';

// A provider whose promptForAccess answer the test dictates. Only that member is exercised, so the
// rest of HostGeolocationProvider stays absent on purpose — a probe needing the whole provider would be
// testing the fake.
function providerAnswering(outcome: GeolocationAccessOutcome): HostGeolocationProvider {
  return { promptForAccess: () => Promise.resolve(outcome) } as unknown as HostGeolocationProvider;
}

describe('promptForGeolocationAccess', () => {
  it('reports granted when the host grants access', async () => {
    expect(await promptForGeolocationAccess(providerAnswering({ reason: 'granted' }))).toEqual({
      reason: 'granted',
    });
  });

  // The three user-facing answers must stay distinct. `denied` means stop asking; `dismissed` means the
  // prompt closed undecided; `timeout` means no fix arrived in time and says NOTHING about the user.
  it('keeps denied, dismissed and timeout as three distinct outcomes', async () => {
    const reasons = await Promise.all(
      (['denied', 'dismissed', 'timeout'] as const).map(
        async (reason) => (await promptForGeolocationAccess(providerAnswering({ reason }))).reason,
      ),
    );
    expect(reasons).toEqual(['denied', 'dismissed', 'timeout']);
    expect(new Set(reasons).size).toBe(3);
  });

  it('reports runtime-unavailable when no provider is installed', async () => {
    expect(await promptForGeolocationAccess(undefined)).toEqual({ reason: 'runtime-unavailable' });
  });

  it('reports operation-failed when the provider throws', async () => {
    const throwing = {
      promptForAccess: () => Promise.reject(new Error('boom')),
    } as unknown as HostGeolocationProvider;
    expect(await promptForGeolocationAccess(throwing)).toEqual({ reason: 'operation-failed' });
  });

  // A capability outcome, never permission vocabulary: G6 lets geolocation keep the mechanism only
  // because what it returns is not a PermissionState. `state` must never appear on this type.
  it('carries no permission state field on any arm', async () => {
    for (const reason of ['granted', 'denied', 'dismissed', 'timeout', 'cleanup-failed'] as const) {
      const outcome = await promptForGeolocationAccess(providerAnswering({ reason }));
      expect(Object.hasOwn(outcome, 'state')).toBe(false);
    }
  });
});
