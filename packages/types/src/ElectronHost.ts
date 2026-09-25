import type { ElectronIpcTarget } from './ElectronApi.ts';
import type { ElectronAppCapabilitiesFor } from './ElectronAppCapabilitiesFor.ts';
import type { ElectronProtocolCapabilities } from './ElectronProtocolCapabilities.ts';
import type { ElectronTrayCapabilitiesFor } from './ElectronTrayCapabilitiesFor.ts';
import type {
  Host,
  HostClipboardCapabilities,
  HostDialogCapabilities,
  HostIpcCapabilities,
  HostPlatformCapabilities,
  HostPreferencesCapabilities,
  HostScreenCapabilities,
  HostShellCapabilities,
  HostShortcutCapabilities,
  HostUpdaterCapabilities,
  HostWindowCapabilities,
} from './Host.ts';
import type { HostIpcTargetedSendCapability } from './Ipc.ts';
import type { ElectronMenuCapabilities } from './Menu.ts';
import type { ElectronMacosNotificationCapabilities, ElectronNotificationCapabilities } from './Notification.ts';
import type { ElectronPowerCapabilities } from './Power.ts';
import type { DesktopOsProfile } from './Tray.ts';

type ElectronNotificationCapabilitiesFor<Profile extends DesktopOsProfile> = Profile extends 'macos'
  ? ElectronMacosNotificationCapabilities
  : ElectronNotificationCapabilities;

type ElectronShellCapabilitiesFor<Profile extends DesktopOsProfile> = Required<
  Pick<HostShellCapabilities, 'beep' | 'external' | 'pathOpen' | 'pathReveal' | 'trash'>
> &
  (Profile extends 'windows' ? Required<Pick<HostShellCapabilities, 'shortcutLink'>> : object);

export type ElectronHost<Profile extends DesktopOsProfile> = Omit<
  Host,
  | 'app'
  | 'clipboard'
  | 'dialog'
  | 'ipc'
  | 'menu'
  | 'notification'
  | 'platform'
  | 'power'
  | 'preferences'
  | 'protocol'
  | 'screen'
  | 'shell'
  | 'shortcut'
  | 'tray'
  | 'updater'
  | 'window'
> & {
  readonly app: ElectronAppCapabilitiesFor<Profile>;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'bookmark' | 'formats' | 'image' | 'text'>>;
  readonly dialog: Required<Pick<HostDialogCapabilities, 'directoryOpen' | 'fileOpen' | 'fileSave' | 'message'>>;
  readonly ipc: Required<Pick<HostIpcCapabilities, 'handle' | 'message'>> & {
    readonly targetedSend: HostIpcTargetedSendCapability<ElectronIpcTarget>;
  };
  readonly menu: ElectronMenuCapabilities;
  readonly notification: ElectronNotificationCapabilitiesFor<Profile>;
  readonly platform: Required<Pick<HostPlatformCapabilities, 'info'>>;
  readonly power: ElectronPowerCapabilities;
  readonly preferences: Required<Pick<HostPreferencesCapabilities, 'local'>>;
  readonly protocol: ElectronProtocolCapabilities;
  readonly screen: Required<Pick<HostScreenCapabilities, 'change' | 'query'>>;
  readonly shell: ElectronShellCapabilitiesFor<Profile>;
  readonly shortcut: Required<Pick<HostShortcutCapabilities, 'query' | 'trigger'>>;
  readonly tray: ElectronTrayCapabilitiesFor<Profile>;
  readonly updater: Required<Pick<HostUpdaterCapabilities, 'command'>>;
  // Electron covers every window capability slot; the hooks it does not implement (the subscribe
  // pair inside geometry, lifecycle and visibility) stay optional within their slot.
  readonly window: Required<HostWindowCapabilities>;
};

export type ElectronMacosHost = ElectronHost<'macos'>;
