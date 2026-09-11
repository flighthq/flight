import type { MobileOsProfile } from './App';
import type { CapacitorAppCapabilitiesFor } from './CapacitorAppCapabilitiesFor';
import type { CapacitorProtocolCapabilities } from './CapacitorProtocolCapabilities';
import type {
  Host,
  HostClipboardCapabilities,
  HostConnectivityCapabilities,
  HostDialogCapabilities,
  HostInputCapabilities,
  HostShareCapabilities,
  HostStorageCapabilities,
  HostSystemCapabilities,
  HostUiCapabilities,
} from './Host';
import type { CapacitorNotificationCapabilities } from './Notification';
import type { HostCapacitorShareContentProvider } from './Share';

export type CapacitorHost<Profile extends MobileOsProfile> = Host & {
  readonly app: CapacitorAppCapabilitiesFor<Profile>;
  readonly clipboard: HostClipboardCapabilities & Required<Pick<HostClipboardCapabilities, 'image' | 'text'>>;
  readonly connectivity: HostConnectivityCapabilities &
    Required<Pick<HostConnectivityCapabilities, 'change' | 'status'>>;
  readonly dialog: HostDialogCapabilities & Required<Pick<HostDialogCapabilities, 'message' | 'prompt'>>;
  readonly input: HostInputCapabilities &
    Required<
      Pick<
        HostInputCapabilities,
        | 'haptics'
        | 'softKeyboardAccessoryBar'
        | 'softKeyboardChange'
        | 'softKeyboardInfo'
        | 'softKeyboardResizeModeWrite'
        | 'softKeyboardScrollAssist'
        | 'softKeyboardStyle'
        | 'softKeyboardVisibility'
      >
    >;
  readonly notification: CapacitorNotificationCapabilities;
  readonly protocol: CapacitorProtocolCapabilities;
  readonly share: HostShareCapabilities & { readonly content: HostCapacitorShareContentProvider };
  readonly storage: HostStorageCapabilities & Required<Pick<HostStorageCapabilities, 'fileSystem'>>;
  readonly system: HostSystemCapabilities & Required<Pick<HostSystemCapabilities, 'device' | 'geolocation'>>;
  readonly ui: HostUiCapabilities &
    Required<
      Pick<
        HostUiCapabilities,
        'statusBarColor' | 'statusBarInfo' | 'statusBarOverlays' | 'statusBarStyle' | 'statusBarVisibility'
      >
    >;
};
