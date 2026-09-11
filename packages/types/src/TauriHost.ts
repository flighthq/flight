import type { HostWindowProvider } from './ApplicationWindow';
import type {
  Host,
  HostClipboardCapabilities,
  HostDialogCapabilities,
  HostShellCapabilities,
  HostShortcutCapabilities,
  HostSystemCapabilities,
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
  readonly shell: Required<Pick<HostShellCapabilities, 'external' | 'pathOpen' | 'pathReveal'>>;
  readonly shortcut: Required<Pick<HostShortcutCapabilities, 'query' | 'trigger'>>;
  readonly system: Required<Pick<HostSystemCapabilities, 'platform'>>;
  readonly tray: TauriTrayCapabilitiesFor<Profile>;
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'attach' | 'close' | 'open'>>;
};
