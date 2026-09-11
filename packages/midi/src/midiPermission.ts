import type { HostMidiPermissionProvider, PermissionQueryOutcome } from '@flighthq/types/contract';

export async function getMidiPermission(
  hostMidiPermission: Readonly<HostMidiPermissionProvider>,
): Promise<PermissionQueryOutcome> {
  try {
    return await hostMidiPermission.getPermission();
  } catch {
    return { reason: 'operation-failed' };
  }
}
