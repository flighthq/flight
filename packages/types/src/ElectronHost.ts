import type { HostWindowProvider } from './ApplicationWindow';
import type { ElectronIpcTarget } from './ElectronApi';
import type { ElectronAppCapabilitiesFor } from './ElectronAppCapabilitiesFor';
import type { ElectronProtocolCapabilities } from './ElectronProtocolCapabilities';
import type { ElectronTrayCapabilitiesFor } from './ElectronTrayCapabilitiesFor';
import type {
  Host,
  HostClipboardCapabilities,
  HostDialogCapabilities,
  HostIpcCapabilities,
  HostScreenCapabilities,
  HostShellCapabilities,
  HostShortcutCapabilities,
  HostStorageCapabilities,
  HostSystemCapabilities,
  HostUpdaterCapabilities,
} from './Host';
import type { ElectronMenuCapabilities } from './Menu';
import type { ElectronMacosNotificationCapabilities, ElectronNotificationCapabilities } from './Notification';
import type { ElectronPowerCapabilities } from './Power';
import type { DesktopOsProfile } from './Tray';

type ElectronNotificationCapabilitiesFor<Profile extends DesktopOsProfile> = Profile extends 'macos'
  ? ElectronMacosNotificationCapabilities
  : ElectronNotificationCapabilities;

type ElectronShellCapabilitiesFor<Profile extends DesktopOsProfile> = Required<
  Pick<HostShellCapabilities, 'beep' | 'external' | 'pathOpen' | 'pathReveal' | 'trash'>
> &
  (Profile extends 'windows' ? Required<Pick<HostShellCapabilities, 'shortcutLink'>> : object);

// The canonical Electron host makes the exact populated group shapes visible to callers while
// retaining every required Host group. Conditional groups preserve macOS/Windows/Linux coverage.
export type ElectronHost<Profile extends DesktopOsProfile> = Omit<
  Host,
  | 'app'
  | 'clipboard'
  | 'dialog'
  | 'ipc'
  | 'menu'
  | 'notification'
  | 'power'
  | 'protocol'
  | 'screen'
  | 'shell'
  | 'shortcut'
  | 'storage'
  | 'system'
  | 'tray'
  | 'updater'
  | 'window'
> & {
  readonly app: ElectronAppCapabilitiesFor<Profile>;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'bookmark' | 'formats' | 'image' | 'text'>>;
  readonly dialog: Required<Pick<HostDialogCapabilities, 'directoryOpen' | 'fileOpen' | 'fileSave' | 'message'>>;
  readonly ipc: Required<Pick<HostIpcCapabilities, 'handle' | 'message' | 'targetedSend'>> & {
    readonly targetedSend: NonNullable<HostIpcCapabilities['targetedSend']> & {
      send(target: ElectronIpcTarget, channel: string, args: readonly unknown[]): void;
    };
  };
  readonly menu: ElectronMenuCapabilities;
  readonly notification: ElectronNotificationCapabilitiesFor<Profile>;
  readonly power: ElectronPowerCapabilities;
  readonly protocol: ElectronProtocolCapabilities;
  readonly screen: Required<Pick<HostScreenCapabilities, 'change' | 'query'>>;
  readonly shell: ElectronShellCapabilitiesFor<Profile>;
  readonly shortcut: Required<Pick<HostShortcutCapabilities, 'query' | 'trigger'>>;
  readonly storage: Required<Pick<HostStorageCapabilities, 'local'>>;
  readonly system: Required<Pick<HostSystemCapabilities, 'platform'>>;
  readonly tray: ElectronTrayCapabilitiesFor<Profile>;
  readonly updater: Required<Pick<HostUpdaterCapabilities, 'command'>>;
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'attach' | 'close' | 'open'>>;
};

export type ElectronMacosHost = ElectronHost<'macos'>;
