import type { HostWindowProvider } from './ApplicationWindow';
import type {
  HostClipboardBookmarkProvider,
  HostClipboardFormatsProvider,
  HostClipboardImageProvider,
  HostClipboardTextProvider,
} from './Clipboard';
import type { ElectronIpcTarget } from './ElectronApi';
import type { ElectronAppCapabilitiesFor } from './ElectronAppCapabilitiesFor';
import type { ElectronProtocolCapabilities } from './ElectronProtocolCapabilities';
import type { ElectronTrayCapabilitiesFor } from './ElectronTrayCapabilitiesFor';
import type {
  HostDirectoryOpenDialogProvider,
  HostFileOpenDialogProvider,
  HostFileSaveDialogProvider,
} from './FileDialogBackend';
import type { Host } from './Host';
import type { HostIpcHandleProvider, HostIpcMessageProvider, HostIpcTargetedSendProvider } from './Ipc';
import type { HostMenuApplicationProvider, HostMenuPopupProvider, HostMenuSelectProvider } from './Menu';
import type { HostMessageDialogProvider } from './MessageDialogBackend';
import type {
  HostNotificationActionProvider,
  HostNotificationClickProvider,
  HostNotificationCloseProvider,
  HostNotificationDeliveryProvider,
  HostNotificationDismissProvider,
  HostNotificationLifecycleProvider,
  HostNotificationReceivedProvider,
  HostNotificationReplyProvider,
} from './Notification';
import type { HostScreenChangeProvider, HostScreenQueryProvider } from './Screen';
import type {
  HostShellBeepProvider,
  HostShellExternalProvider,
  HostShellPathOpenProvider,
  HostShellPathRevealProvider,
  HostShellTrashProvider,
} from './Shell';
import type { HostShortcutQueryProvider, HostShortcutTriggerProvider } from './Shortcut';
import type { HostStorageProvider } from './Storage';
import type { DesktopOsProfile } from './Tray';
import type { HostUpdaterCommandProvider } from './Updater';

export type ElectronHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: ElectronAppCapabilitiesFor<Profile>;
  readonly protocol: ElectronProtocolCapabilities;
  readonly tray: ElectronTrayCapabilitiesFor<Profile>;
} & { readonly clipboard: { readonly bookmark: HostClipboardBookmarkProvider } } & {
  readonly clipboard: { readonly formats: HostClipboardFormatsProvider };
} & { readonly clipboard: { readonly image: HostClipboardImageProvider } } & {
  readonly clipboard: { readonly text: HostClipboardTextProvider };
} & { readonly dialog: { readonly directoryOpen: HostDirectoryOpenDialogProvider } } & {
  readonly dialog: { readonly fileOpen: HostFileOpenDialogProvider };
} & { readonly dialog: { readonly fileSave: HostFileSaveDialogProvider } } & {
  readonly dialog: { readonly message: HostMessageDialogProvider };
} & { readonly ipc: { readonly handle: HostIpcHandleProvider } } & {
  readonly ipc: { readonly message: HostIpcMessageProvider };
} & { readonly ipc: { readonly targetedSend: HostIpcTargetedSendProvider<ElectronIpcTarget> } } & {
  readonly menu: { readonly application: HostMenuApplicationProvider };
} & { readonly menu: { readonly popup: HostMenuPopupProvider } } & {
  readonly menu: { readonly select: HostMenuSelectProvider };
} & { readonly notification: { readonly click: HostNotificationClickProvider } } & {
  readonly notification: { readonly close: HostNotificationCloseProvider };
} & { readonly notification: { readonly delivery: HostNotificationDeliveryProvider } } & {
  readonly notification: { readonly dismiss: HostNotificationDismissProvider };
} & { readonly notification: { readonly lifecycle: HostNotificationLifecycleProvider } } & {
  readonly notification: { readonly received: HostNotificationReceivedProvider };
} & { readonly screen: { readonly change: HostScreenChangeProvider } } & {
  readonly screen: { readonly query: HostScreenQueryProvider };
} & { readonly shell: { readonly beep: HostShellBeepProvider } } & {
  readonly shell: { readonly external: HostShellExternalProvider };
} & { readonly shell: { readonly pathOpen: HostShellPathOpenProvider } } & {
  readonly shell: { readonly pathReveal: HostShellPathRevealProvider };
} & { readonly shell: { readonly trash: HostShellTrashProvider } } & {
  readonly shortcut: { readonly query: HostShortcutQueryProvider };
} & { readonly shortcut: { readonly trigger: HostShortcutTriggerProvider } } & {
  readonly storage: { readonly local: HostStorageProvider };
} & { readonly updater: { readonly command: HostUpdaterCommandProvider } } & {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'attach' | 'close'>>;
} & { readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'close' | 'open'>> };

export type ElectronMacosHost = ElectronHost<'macos'> & {
  readonly notification: { readonly action: HostNotificationActionProvider };
} & { readonly notification: { readonly reply: HostNotificationReplyProvider } };
