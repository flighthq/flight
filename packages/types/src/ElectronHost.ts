import type { ElectronIpcTarget } from './ElectronApi';
import type { ElectronAppCapabilitiesFor } from './ElectronAppCapabilitiesFor';
import type { ElectronProtocolCapabilities } from './ElectronProtocolCapabilities';
import type { ElectronTrayCapabilitiesFor } from './ElectronTrayCapabilitiesFor';
import type {
  HasClipboardBookmark,
  HasClipboardFormats,
  HasClipboardImage,
  HasClipboardText,
  HasDialogDirectoryOpen,
  HasDialogFileOpen,
  HasDialogFileSave,
  HasDialogMessage,
  HasIpcHandle,
  HasIpcMessage,
  HasIpcTargetedSend,
  HasMenuApplication,
  HasMenuPopup,
  HasMenuSelect,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationClose,
  HasNotificationDelivery,
  HasNotificationDismiss,
  HasNotificationLifecycle,
  HasNotificationReceived,
  HasNotificationReply,
  HasScreenChange,
  HasScreenQuery,
  HasShellBeep,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasShellTrash,
  HasShortcutQuery,
  HasShortcutTrigger,
  HasStorageLocal,
  HasUpdaterCommand,
  HasWindowAttach,
  HasWindowOpen,
  Host,
} from './Host';
import type { DesktopOsProfile } from './Tray';

export type ElectronHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: ElectronAppCapabilitiesFor<Profile>;
  readonly protocol: ElectronProtocolCapabilities;
  readonly tray: ElectronTrayCapabilitiesFor<Profile>;
} & HasClipboardBookmark &
  HasClipboardFormats &
  HasClipboardImage &
  HasClipboardText &
  HasDialogDirectoryOpen &
  HasDialogFileOpen &
  HasDialogFileSave &
  HasDialogMessage &
  HasIpcHandle &
  HasIpcMessage &
  HasIpcTargetedSend<ElectronIpcTarget> &
  HasMenuApplication &
  HasMenuPopup &
  HasMenuSelect &
  HasNotificationClick &
  HasNotificationClose &
  HasNotificationDelivery &
  HasNotificationDismiss &
  HasNotificationLifecycle &
  HasNotificationReceived &
  HasScreenChange &
  HasScreenQuery &
  HasShellBeep &
  HasShellExternal &
  HasShellPathOpen &
  HasShellPathReveal &
  HasShellTrash &
  HasShortcutQuery &
  HasShortcutTrigger &
  HasStorageLocal &
  HasUpdaterCommand &
  HasWindowAttach &
  HasWindowOpen;

export type ElectronMacosHost = ElectronHost<'macos'> & HasNotificationAction & HasNotificationReply;
