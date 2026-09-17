import type { HostMidiPermissionCapability, PermissionQueryOutcome } from '@flighthq/types/contract';

export async function getMidiPermission(
  hostMidiPermission: Readonly<HostMidiPermissionCapability>,
): Promise<PermissionQueryOutcome> {
  try {
    return await hostMidiPermission.getPermission();
  } catch {
    return { reason: 'operation-failed' };
  }
}
