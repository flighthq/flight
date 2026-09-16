import type {
  Host,
  HostClipboardCapabilities,
  HostDialogCapabilities,
  HostPlatformCapabilities,
  HostShellCapabilities,
  HostShortcutCapabilities,
  HostWindowCapabilities,
} from './Host';
import type { TauriMenuCapabilities } from './Menu';
import type { TauriNotificationCapabilities } from './Notification';
import type { TauriAppCapabilities } from './TauriAppCapabilities';
import type { TauriTrayCapabilitiesFor } from './TauriTrayCapabilitiesFor';
import type { DesktopOsProfile } from './Tray';

export type TauriHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: TauriAppCapabilities;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'text'>>;
  readonly dialog: Required<Pick<HostDialogCapabilities, 'directoryOpen' | 'fileOpen' | 'fileSave' | 'message'>>;
  readonly menu: TauriMenuCapabilities;
  readonly notification: TauriNotificationCapabilities;
  readonly platform: Required<Pick<HostPlatformCapabilities, 'info'>>;
  readonly shell: Required<Pick<HostShellCapabilities, 'external' | 'pathOpen' | 'pathReveal'>>;
  readonly shortcut: Required<Pick<HostShortcutCapabilities, 'query' | 'trigger'>>;
  readonly tray: TauriTrayCapabilitiesFor<Profile>;
  readonly window: Required<Pick<HostWindowCapabilities, 'attach' | 'lifecycle'>>;
};
