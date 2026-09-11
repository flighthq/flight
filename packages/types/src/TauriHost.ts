import type { HostWindowProvider } from './ApplicationWindow';
import type { HostClipboardTextProvider } from './Clipboard';
import type {
  HostDirectoryOpenDialogProvider,
  HostFileOpenDialogProvider,
  HostFileSaveDialogProvider,
} from './FileDialogBackend';
import type { Host } from './Host';
import type { HostMenuApplicationProvider, HostMenuPopupProvider, HostMenuSelectProvider } from './Menu';
import type { HostMessageDialogProvider } from './MessageDialogBackend';
import type {
  HostNotificationDeliveryProvider,
  HostNotificationLifecycleProvider,
  HostNotificationPermissionProvider,
} from './Notification';
import type { HostShellExternalProvider, HostShellPathOpenProvider, HostShellPathRevealProvider } from './Shell';
import type { HostShortcutQueryProvider, HostShortcutTriggerProvider } from './Shortcut';
import type { TauriAppCapabilities } from './TauriAppCapabilities';
import type { TauriTrayCapabilitiesFor } from './TauriTrayCapabilitiesFor';
import type { DesktopOsProfile } from './Tray';

export type TauriHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: TauriAppCapabilities;
  readonly tray: TauriTrayCapabilitiesFor<Profile>;
} & { readonly clipboard: { readonly text: HostClipboardTextProvider } } & {
  readonly dialog: { readonly directoryOpen: HostDirectoryOpenDialogProvider };
} & { readonly dialog: { readonly fileOpen: HostFileOpenDialogProvider } } & {
  readonly dialog: { readonly fileSave: HostFileSaveDialogProvider };
} & { readonly dialog: { readonly message: HostMessageDialogProvider } } & {
  readonly menu: { readonly application: HostMenuApplicationProvider };
} & { readonly menu: { readonly popup: HostMenuPopupProvider } } & {
  readonly menu: { readonly select: HostMenuSelectProvider };
} & { readonly notification: { readonly delivery: HostNotificationDeliveryProvider } } & {
  readonly notification: { readonly lifecycle: HostNotificationLifecycleProvider };
} & { readonly notification: { readonly permission: HostNotificationPermissionProvider } } & {
  readonly shell: { readonly external: HostShellExternalProvider };
} & { readonly shell: { readonly pathOpen: HostShellPathOpenProvider } } & {
  readonly shell: { readonly pathReveal: HostShellPathRevealProvider };
} & { readonly shortcut: { readonly query: HostShortcutQueryProvider } } & {
  readonly shortcut: { readonly trigger: HostShortcutTriggerProvider };
} & { readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'attach' | 'close'>> } & {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'close' | 'open'>>;
};
