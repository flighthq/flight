import type {
  HasClipboardText,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogMessage,
  HasMenuApplication,
  HasMenuPopup,
  HasMenuSelect,
  HasNotificationDelivery,
  HasNotificationLifecycle,
  HasNotificationPermission,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasShortcutQuery,
  HasShortcutTrigger,
  HasWindowAttach,
  HasWindowOpen,
  Host,
} from './Host';
import type { TauriAppCapabilities } from './TauriAppCapabilities';
import type { TauriTrayCapabilitiesFor } from './TauriTrayCapabilitiesFor';
import type { DesktopOsProfile } from './Tray';

export type TauriHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: TauriAppCapabilities;
  readonly tray: TauriTrayCapabilitiesFor<Profile>;
} & HasClipboardText &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogMessage &
  HasMenuApplication &
  HasMenuPopup &
  HasMenuSelect &
  HasNotificationDelivery &
  HasNotificationLifecycle &
  HasNotificationPermission &
  HasShellExternal &
  HasShellPathOpen &
  HasShellPathReveal &
  HasShortcutQuery &
  HasShortcutTrigger &
  HasWindowAttach &
  HasWindowOpen;
