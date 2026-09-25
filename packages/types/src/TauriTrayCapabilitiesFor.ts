import type { HostTrayCapabilities } from './Host.ts';
import type { DesktopOsProfile } from './Tray.ts';

type TauriCommonTrayCapabilities = Required<
  Pick<HostTrayCapabilities, 'image' | 'lifecycle' | 'menu' | 'menuSelectionEvents'>
>;
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
