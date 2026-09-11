import type {
  HostIpcCapabilities,
  HostMidiCapabilities,
  HostNotificationCapabilities,
  HostShortcutCapabilities,
  HostTrayCapabilities,
  HostUpdaterCapabilities,
} from '@flighthq/types/contract';

export const webHostIpc = {} satisfies HostIpcCapabilities;
export const webHostMidi = {} satisfies HostMidiCapabilities;
export const webHostNotification = {} satisfies HostNotificationCapabilities;
export const webHostShortcut = {} satisfies HostShortcutCapabilities;
export const webHostTray = {} satisfies HostTrayCapabilities;
export const webHostUpdater = {} satisfies HostUpdaterCapabilities;
