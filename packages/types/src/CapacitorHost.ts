import type { MobileOsProfile } from './App';
import type { CapacitorAppCapabilitiesFor } from './CapacitorAppCapabilitiesFor';
import type { CapacitorProtocolCapabilities } from './CapacitorProtocolCapabilities';
import type {
  Host,
  HostClipboardCapabilities,
  HostConnectivityCapabilities,
  HostDeviceCapabilities,
  HostDialogCapabilities,
  HostFileSystemCapabilities,
  HostGeolocationCapabilities,
  HostHapticsCapabilities,
  HostShareCapabilities,
  HostSoftKeyboardCapabilities,
  HostStatusBarCapabilities,
} from './Host';
import type { CapacitorNotificationCapabilities } from './Notification';
import type { HostCapacitorShareContentCapability } from './Share';

export type CapacitorHost<Profile extends MobileOsProfile> = Host & {
  readonly app: CapacitorAppCapabilitiesFor<Profile>;
  readonly clipboard: HostClipboardCapabilities & Required<Pick<HostClipboardCapabilities, 'image' | 'text'>>;
  readonly connectivity: HostConnectivityCapabilities &
    Required<Pick<HostConnectivityCapabilities, 'change' | 'status'>>;
  readonly device: Required<Pick<HostDeviceCapabilities, 'info'>>;
  readonly dialog: HostDialogCapabilities & Required<Pick<HostDialogCapabilities, 'message' | 'prompt'>>;
  readonly fileSystem: Required<Pick<HostFileSystemCapabilities, 'access'>>;
  readonly geolocation: Required<Pick<HostGeolocationCapabilities, 'position'>>;
  readonly haptics: Required<Pick<HostHapticsCapabilities, 'engine'>>;
  readonly notification: CapacitorNotificationCapabilities;
  readonly protocol: CapacitorProtocolCapabilities;
  readonly share: HostShareCapabilities & { readonly content: HostCapacitorShareContentCapability };
  readonly softKeyboard: Required<
    Pick<
      HostSoftKeyboardCapabilities,
      'accessoryBar' | 'change' | 'info' | 'resizeModeWrite' | 'scrollAssist' | 'style' | 'visibility'
    >
  >;
  readonly statusBar: Required<Pick<HostStatusBarCapabilities, 'color' | 'info' | 'overlays' | 'style' | 'visibility'>>;
};
