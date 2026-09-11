import type { MobileOsProfile } from './App';
import type { CapacitorAppCapabilitiesFor } from './CapacitorAppCapabilitiesFor';
import type { CapacitorProtocolCapabilities } from './CapacitorProtocolCapabilities';
import type { HostClipboardImageProvider, HostClipboardTextProvider } from './Clipboard';
import type { HostConnectivityChangeProvider, HostConnectivityStatusProvider } from './Connectivity';
import type { HostFileSystemProvider } from './FileSystem';
import type { HostHapticsProvider } from './Haptics';
import type { Host } from './Host';
import type {
  HostSoftKeyboardAccessoryBarProvider,
  HostSoftKeyboardChangeProvider,
  HostSoftKeyboardInfoProvider,
  HostSoftKeyboardResizeModeWriteProvider,
  HostSoftKeyboardScrollAssistProvider,
  HostSoftKeyboardStyleProvider,
  HostSoftKeyboardVisibilityProvider,
} from './Keyboard';
import type { HostMessageDialogProvider } from './MessageDialogBackend';
import type {
  HostNotificationActionProvider,
  HostNotificationClickProvider,
  HostNotificationDeliveryProvider,
  HostNotificationLifecycleProvider,
  HostNotificationPermissionProvider,
  HostNotificationSchedulingProvider,
} from './Notification';
import type { HostPromptDialogProvider } from './PromptDialogBackend';
import type { CapacitorShareContentBackend } from './Share';
import type {
  HostStatusBarColorProvider,
  HostStatusBarInfoProvider,
  HostStatusBarOverlaysProvider,
  HostStatusBarStyleProvider,
  HostStatusBarVisibilityProvider,
} from './StatusBar';

export type CapacitorHost<Profile extends MobileOsProfile> = Host & {
  readonly clipboard: { readonly image: HostClipboardImageProvider };
} & { readonly clipboard: { readonly text: HostClipboardTextProvider } } & {
  readonly connectivity: { readonly change: HostConnectivityChangeProvider };
} & { readonly connectivity: { readonly status: HostConnectivityStatusProvider } } & {
  readonly dialog: { readonly message: HostMessageDialogProvider };
} & { readonly dialog: { readonly prompt: HostPromptDialogProvider } } & {
  readonly input: { readonly haptics: HostHapticsProvider };
} & { readonly notification: { readonly action: HostNotificationActionProvider } } & {
  readonly notification: { readonly click: HostNotificationClickProvider };
} & { readonly notification: { readonly delivery: HostNotificationDeliveryProvider } } & {
  readonly notification: { readonly lifecycle: HostNotificationLifecycleProvider };
} & { readonly notification: { readonly permission: HostNotificationPermissionProvider } } & {
  readonly notification: { readonly scheduling: HostNotificationSchedulingProvider };
} & {
  readonly input: {
    readonly softKeyboardAccessoryBar: HostSoftKeyboardAccessoryBarProvider;
  };
} & { readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider } } & {
  readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
} & {
  readonly input: {
    readonly softKeyboardResizeModeWrite: HostSoftKeyboardResizeModeWriteProvider;
  };
} & {
  readonly input: {
    readonly softKeyboardScrollAssist: HostSoftKeyboardScrollAssistProvider;
  };
} & { readonly input: { readonly softKeyboardStyle: HostSoftKeyboardStyleProvider } } & {
  readonly input: {
    readonly softKeyboardVisibility: HostSoftKeyboardVisibilityProvider;
  };
} & { readonly storage: { readonly fileSystem: HostFileSystemProvider } } & {
  readonly ui: { readonly statusBarColor: HostStatusBarColorProvider };
} & { readonly ui: { readonly statusBarInfo: HostStatusBarInfoProvider } } & {
  readonly ui: { readonly statusBarOverlays: HostStatusBarOverlaysProvider };
} & { readonly ui: { readonly statusBarStyle: HostStatusBarStyleProvider } } & {
  readonly ui: { readonly statusBarVisibility: HostStatusBarVisibilityProvider };
} & {
  readonly app: CapacitorAppCapabilitiesFor<Profile>;
  readonly protocol: CapacitorProtocolCapabilities;
  readonly share: { readonly content: CapacitorShareContentBackend };
};
