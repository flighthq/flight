import type { Entity } from './Entity';
import type { HostTrayCapabilities } from './Host';
import type { DesktopOsProfile } from './Tray';

// The Entity intersection sits on the common base, so every profile branch inherits it — the same shape
// the app and screen capability groups already use. A capability group is a Flight-owned object handed
// to a Host, not a descriptor.
type ElectronCommonTrayCapabilities = Entity &
  Required<
    Pick<
      HostTrayCapabilities,
      'bounds' | 'image' | 'interactionEvents' | 'lifecycle' | 'menu' | 'menuSelectionEvents' | 'popupMenu' | 'tooltip'
    >
  >;
type ElectronMacosTrayCapabilities = ElectronCommonTrayCapabilities &
  Required<Pick<HostTrayCapabilities, 'doubleClickPolicy' | 'dropEvents' | 'pressedImage' | 'templateImage' | 'title'>>;
type ElectronWindowsTrayCapabilities = ElectronCommonTrayCapabilities &
  Required<Pick<HostTrayCapabilities, 'balloon' | 'balloonEvents'>>;

export type ElectronTrayCapabilitiesFor<Profile extends DesktopOsProfile> = Profile extends 'macos'
  ? ElectronMacosTrayCapabilities
  : Profile extends 'windows'
    ? ElectronWindowsTrayCapabilities
    : ElectronCommonTrayCapabilities;
