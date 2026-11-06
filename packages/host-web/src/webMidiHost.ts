import type { HostMidiCapabilities } from '@flighthq/host/contract';

import { webHostMidiAccess, webHostMidiPermission } from './webMidi.ts';

export const webHostMidi: HostMidiCapabilities = {
  access: webHostMidiAccess,
  permission: webHostMidiPermission,
};
