import type { PermissionQueryOutcome } from '@flighthq/types/contract';

import type { HostMidiPermissionCapability } from './types.ts';

export async function getMidiPermission(
  hostMidiPermission: Readonly<HostMidiPermissionCapability>,
): Promise<PermissionQueryOutcome> {
  try {
    return await hostMidiPermission.getPermission();
  } catch {
    return { reason: 'operation-failed' };
  }
}
