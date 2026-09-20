import type { HostMidiCapabilities } from '@flighthq/types/contract';

import { webHostMidiAccess, webHostMidiPermission } from './webMidi';

export const webHostMidi: HostMidiCapabilities = {
  access: webHostMidiAccess,
  permission: webHostMidiPermission,
};
