import type { HostTrayCapabilities } from './Host.ts';
import type { DesktopOsProfile } from './Tray.ts';

type ElectronCommonTrayCapabilities = Required<
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
