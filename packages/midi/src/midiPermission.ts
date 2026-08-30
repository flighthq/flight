import type { HasMidiPermission, PermissionQueryOutcome } from '@flighthq/types/contract';

export async function getMidiPermission(host: HasMidiPermission): Promise<PermissionQueryOutcome> {
  try {
    return await host.midi.permission.getPermission();
  } catch {
    return { reason: 'operation-failed' };
  }
}
