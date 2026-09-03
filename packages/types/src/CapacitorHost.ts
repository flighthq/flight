import type { MobileOsProfile } from './App';
import type { CapacitorAppCapabilitiesFor } from './CapacitorAppCapabilitiesFor';
import type { CapacitorProtocolCapabilities } from './CapacitorProtocolCapabilities';
import type {
  HasClipboardImage,
  HasClipboardText,
  HasConnectivityChange,
  HasConnectivityStatus,
  HasDialogMessage,
  HasDialogPrompt,
  HasInputHaptics,
  HasNotificationAction,
  HasNotificationClick,
  HasNotificationDelivery,
  HasNotificationLifecycle,
  HasNotificationPermission,
  HasNotificationScheduling,
  HasSoftKeyboardAccessoryBar,
  HasSoftKeyboardChange,
  HasSoftKeyboardInfo,
  HasSoftKeyboardResizeModeWrite,
  HasSoftKeyboardScrollAssist,
  HasSoftKeyboardStyle,
  HasSoftKeyboardVisibility,
  HasStorageFileSystem,
  HasUiStatusBarColor,
  HasUiStatusBarInfo,
  HasUiStatusBarOverlays,
  HasUiStatusBarStyle,
  HasUiStatusBarVisibility,
  Host,
} from './Host';
import type { CapacitorShareContentBackend } from './Share';

export type CapacitorHost<Profile extends MobileOsProfile> = Host &
  HasClipboardImage &
  HasClipboardText &
  HasConnectivityChange &
  HasConnectivityStatus &
  HasDialogMessage &
  HasDialogPrompt &
  HasInputHaptics &
  HasNotificationAction &
  HasNotificationClick &
  HasNotificationDelivery &
  HasNotificationLifecycle &
  HasNotificationPermission &
  HasNotificationScheduling &
  HasSoftKeyboardAccessoryBar &
  HasSoftKeyboardChange &
  HasSoftKeyboardInfo &
  HasSoftKeyboardResizeModeWrite &
  HasSoftKeyboardScrollAssist &
  HasSoftKeyboardStyle &
  HasSoftKeyboardVisibility &
  HasStorageFileSystem &
  HasUiStatusBarColor &
  HasUiStatusBarInfo &
  HasUiStatusBarOverlays &
  HasUiStatusBarStyle &
  HasUiStatusBarVisibility & {
    readonly app: CapacitorAppCapabilitiesFor<Profile>;
    readonly protocol: CapacitorProtocolCapabilities;
    readonly share: { readonly content: CapacitorShareContentBackend };
  };
