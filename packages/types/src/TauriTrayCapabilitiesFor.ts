import type { Entity } from './Entity';
import type { HostTrayCapabilities } from './Host';
import type { DesktopOsProfile } from './Tray';

// The Entity intersection sits on the common base, so every profile branch inherits it — the same shape
// the app and screen capability groups already use. A capability group is a Flight-owned object handed
// to a Host, not a descriptor.
type TauriCommonTrayCapabilities = Entity &
  Required<Pick<HostTrayCapabilities, 'image' | 'lifecycle' | 'menu' | 'menuSelectionEvents'>>;
type TauriLinuxTrayCapabilities = TauriCommonTrayCapabilities & Required<Pick<HostTrayCapabilities, 'title'>>;
type TauriMacosTrayCapabilities = TauriCommonTrayCapabilities &
  Required<Pick<HostTrayCapabilities, 'interactionEvents' | 'templateImage' | 'title' | 'tooltip'>>;
type TauriWindowsTrayCapabilities = TauriCommonTrayCapabilities &
  Required<Pick<HostTrayCapabilities, 'interactionEvents' | 'tooltip'>>;

export type TauriTrayCapabilitiesFor<Profile extends DesktopOsProfile> = Profile extends 'macos'
  ? TauriMacosTrayCapabilities
  : Profile extends 'windows'
    ? TauriWindowsTrayCapabilities
    : TauriLinuxTrayCapabilities;
