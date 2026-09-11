import type { HostAccessibilityProvider } from './Accessibility';
import type {
  HostAppActivateProvider,
  HostAppActivationPolicyProvider,
  HostAppAllWindowsClosedProvider,
  HostAppBadgeProvider,
  HostAppDockProvider,
  HostAppFocusProvider,
  HostAppHideProvider,
  HostAppLocaleProvider,
  HostAppLoginItemProvider,
  HostAppNameProvider,
  HostAppNameWriteProvider,
  HostAppOpenFileProvider,
  HostAppPathProvider,
  HostAppQuitProvider,
  HostAppQuitRequestProvider,
  HostAppReadyProvider,
  HostAppRecentDocumentsProvider,
  HostAppRelaunchProvider,
  HostAppSecondInstanceProvider,
  HostAppSingleInstanceProvider,
  HostAppUserModelIdProvider,
  HostAppVersionProvider,
  HostAppShowProvider,
  HostAppVisibilityQueryProvider,
} from './App';
import type { HostApplicationExitProvider } from './ApplicationExitBackend';
import type { HostApplicationVisibilityProvider } from './ApplicationVisibilityBackend';
import type { HostWindowProvider } from './ApplicationWindow';
import type {
  HostInputDropFileProvider,
  HostInputFocusProvider,
  HostInputPointerLockProvider,
  HostRenderContextProvider,
  HostRenderSurfaceProvider,
} from './ApplicationWindowTargetBackend';
import type { HostAudioProvider } from './AudioBackend';
import type { HostAudioDeviceProvider } from './AudioDeviceBackend';
import type { HostBidiClassProvider } from './Bidi';
import type { HostBitmapEncodeProvider } from './BitmapEncodeBackend';
import type { HostBitmapReadbackProvider } from './BitmapReadbackBackend';
import type {
  HostClipboardBookmarkProvider,
  HostClipboardChangeProvider,
  HostClipboardFormatsProvider,
  HostClipboardImageProvider,
  HostClipboardTextProvider,
} from './Clipboard';
import type {
  HostConnectivityChangeProvider,
  HostConnectivityReachabilityProvider,
  HostConnectivityStatusProvider,
} from './Connectivity';
import type { HostDeviceProvider } from './Device';
import type { Entity } from './Entity';
import type {
  HostDirectoryOpenDialogProvider,
  HostFileOpenDialogProvider,
  HostFileSaveDialogProvider,
} from './FileDialogBackend';
import type { HostFileSystemProvider } from './FileSystem';
import type { HostFontLoadingProvider } from './FontLoadingBackend';
import type { HostFullscreenProvider } from './FullscreenBackend';
import type { HostGeolocationProvider } from './Geolocation';
import type { HostGlyphRasterizerProvider } from './GlyphSource';
import type { HostHapticsProvider } from './Haptics';
import type { HostImageOpenDialogProvider } from './ImageOpenDialogBackend';
import type { HostImageProvider } from './ImageResource';
import type { HostInputIngressProvider } from './InputIngressBackend';
import type { HostInputTargetProvider } from './InputTargetBackend';
import type {
  HostIpcHandleProvider,
  HostIpcInvokeProvider,
  HostIpcMessageProvider,
  HostIpcSendProvider,
  HostIpcTargetedSendProvider,
} from './Ipc';
import type {
  HostSoftKeyboardAccessoryBarProvider,
  HostSoftKeyboardChangeProvider,
  HostSoftKeyboardInfoProvider,
  HostSoftKeyboardResizeModeWriteProvider,
  HostSoftKeyboardScrollAssistProvider,
  HostSoftKeyboardStyleProvider,
  HostSoftKeyboardVisibilityProvider,
} from './Keyboard';
import type { HostLifecycleProvider } from './Lifecycle';
import type { HostLoopProvider } from './LoopBackend';
import type { HostMediaSessionActionProvider, HostMediaSessionProvider } from './MediaSession';
import type {
  HostMenuApplicationProvider,
  HostMenuHighlightProvider,
  HostMenuPopupProvider,
  HostMenuSelectProvider,
} from './Menu';
import type { HostMessageDialogProvider } from './MessageDialogBackend';
import type { HostMidiAccessProvider, HostMidiPermissionProvider } from './Midi';
import type { HostNetProvider } from './Net';
import type {
  HostNotificationActionProvider,
  HostNotificationActiveListProvider,
  HostNotificationClickProvider,
  HostNotificationCloseProvider,
  HostNotificationDeliveryProvider,
  HostNotificationDismissProvider,
  HostNotificationLifecycleProvider,
  HostNotificationPermissionProvider,
  HostNotificationReceivedProvider,
  HostNotificationReplyProvider,
  HostNotificationSchedulingProvider,
} from './Notification';
import type { HostPathBooleanProvider } from './PathBooleanBackend';
import type { HostPhotoCaptureDialogProvider } from './PhotoCaptureDialogBackend';
import type { HostPlatformProvider } from './Platform';
import type {
  HostPowerBatteryHealthProvider,
  HostPowerChangeProvider,
  HostPowerIdleProvider,
  HostPowerKeepAwakeProvider,
  HostPowerSessionLockProvider,
  HostPowerStatusProvider,
  HostPowerSuspensionProvider,
  HostPowerThermalProvider,
} from './Power';
import type { HostPromptDialogProvider } from './PromptDialogBackend';
import type {
  HostProtocolDefaultProvider,
  HostProtocolLaunchProvider,
  HostProtocolOpenProvider,
  HostProtocolRegistrationProvider,
  HostProtocolRegistrationQueryProvider,
  HostProtocolUnregistrationProvider,
} from './Protocol';
import type {
  HostScreenChangeProvider,
  HostScreenDetailsProvider,
  HostScreenPermissionChangeProvider,
  HostScreenQueryProvider,
} from './Screen';
import type { HostSensorsProvider } from './Sensors';
import type { HostShareContentProvider, HostShareFilesProvider } from './Share';
import type {
  HostShellBeepProvider,
  HostShellExternalProvider,
  HostShellPathOpenProvider,
  HostShellPathRevealProvider,
  HostShellProcessProvider,
  HostShellShortcutLinkProvider,
  HostShellTrashProvider,
} from './Shell';
import type { HostShortcutQueryProvider, HostShortcutTriggerProvider } from './Shortcut';
import type { HostSocketProvider } from './Socket';
import type {
  HostStatusBarChangeProvider,
  HostStatusBarColorProvider,
  HostStatusBarInfoProvider,
  HostStatusBarOverlaysProvider,
  HostStatusBarStyleProvider,
  HostStatusBarVisibilityProvider,
} from './StatusBar';
import type {
  HostStorageProvider,
  HostStorageChangeProvider,
  HostStoragePersistenceQueryProvider,
  HostStoragePersistenceRequestProvider,
} from './Storage';
import type { HostTextSegmenterProvider } from './TextSegment';
import type { HostTextShaperProvider } from './TextShaper';
import type {
  HostTrayBalloonProvider,
  HostTrayBalloonEventsProvider,
  HostTrayBoundsProvider,
  HostTrayDoubleClickPolicyProvider,
  HostTrayDropEventsProvider,
  HostTrayImageProvider,
  HostTrayInteractionEventsProvider,
  HostTrayLifecycleProvider,
  HostTrayMenuProvider,
  HostTrayMenuSelectionEventsProvider,
  HostTrayPopupMenuProvider,
  HostTrayPressedImageProvider,
  HostTrayTemplateImageProvider,
  HostTrayTitleProvider,
  HostTrayTooltipProvider,
} from './Tray';
import type { HostUpdaterCommandProvider } from './Updater';
import type { HostVideoProvider } from './VideoCapabilityBackend';
import type { HostVideoCaptureDialogProvider } from './VideoCaptureDialogBackend';
import type { HostWgpuProvider } from './WgpuHost';

export interface Host extends Entity {
  readonly accessibility: HostAccessibilityCapabilities;
  readonly app: HostAppCapabilities;
  readonly clipboard: HostClipboardCapabilities;
  readonly connectivity: HostConnectivityCapabilities;
  readonly dialog: HostDialogCapabilities;
  readonly graphics: HostGraphicsCapabilities;
  readonly input: HostInputCapabilities;
  readonly ipc: HostIpcCapabilities;
  readonly media: HostMediaCapabilities;
  readonly menu: HostMenuCapabilities;
  readonly midi: HostMidiCapabilities;
  readonly net: HostNetCapabilities;
  readonly power: HostPowerCapabilities;
  readonly protocol: HostProtocolCapabilities;
  readonly notification: HostNotificationCapabilities;
  readonly screen: HostScreenCapabilities;
  readonly share: HostShareCapabilities;
  readonly shell: HostShellCapabilities;
  readonly shortcut: HostShortcutCapabilities;
  readonly storage: HostStorageCapabilities;
  readonly system: HostSystemCapabilities;
  readonly text: HostTextCapabilities;
  readonly tray: HostTrayCapabilities;
  readonly ui: HostUiCapabilities;
  readonly updater: HostUpdaterCapabilities;
  readonly window: HostWindowProvider;
}

export interface HostAccessibilityCapabilities {
  readonly provider?: HostAccessibilityProvider;
}

export interface HostAppCapabilities {
  readonly activate?: HostAppActivateProvider;
  readonly activationPolicy?: HostAppActivationPolicyProvider;
  readonly allWindowsClosed?: HostAppAllWindowsClosedProvider;
  readonly badge?: HostAppBadgeProvider;
  readonly dock?: HostAppDockProvider;
  readonly exit?: HostApplicationExitProvider;
  readonly focus?: HostAppFocusProvider;
  readonly hide?: HostAppHideProvider;
  readonly locale?: HostAppLocaleProvider;
  readonly loginItem?: HostAppLoginItemProvider;
  readonly loop?: HostLoopProvider;
  readonly name?: HostAppNameProvider;
  readonly nameWrite?: HostAppNameWriteProvider;
  readonly openFile?: HostAppOpenFileProvider;
  readonly path?: HostAppPathProvider;
  readonly hiddenQuery?: HostAppVisibilityQueryProvider;
  readonly quit?: HostAppQuitProvider;
  readonly quitRequest?: HostAppQuitRequestProvider;
  readonly ready?: HostAppReadyProvider;
  readonly recentDocuments?: HostAppRecentDocumentsProvider;
  readonly relaunch?: HostAppRelaunchProvider;
  readonly secondInstance?: HostAppSecondInstanceProvider;
  readonly show?: HostAppShowProvider;
  readonly singleInstance?: HostAppSingleInstanceProvider;
  readonly userModelId?: HostAppUserModelIdProvider;
  readonly version?: HostAppVersionProvider;
  readonly visibility?: HostApplicationVisibilityProvider;
}

export interface HostProtocolCapabilities {
  readonly default?: HostProtocolDefaultProvider;
  readonly launch?: HostProtocolLaunchProvider;
  readonly open?: HostProtocolOpenProvider;
  readonly registration?: HostProtocolRegistrationProvider;
  readonly registrationQuery?: HostProtocolRegistrationQueryProvider;
  readonly unregistration?: HostProtocolUnregistrationProvider;
}

export interface HostClipboardCapabilities {
  readonly bookmark?: HostClipboardBookmarkProvider;
  readonly change?: HostClipboardChangeProvider;
  readonly formats?: HostClipboardFormatsProvider;
  readonly image?: HostClipboardImageProvider;
  readonly text?: HostClipboardTextProvider;
}
export interface HostConnectivityCapabilities {
  readonly change?: HostConnectivityChangeProvider;
  readonly reachability?: HostConnectivityReachabilityProvider;
  readonly status?: HostConnectivityStatusProvider;
}

export interface HostDialogCapabilities {
  readonly directoryOpen?: HostDirectoryOpenDialogProvider;
  readonly fileOpen?: HostFileOpenDialogProvider;
  readonly fileSave?: HostFileSaveDialogProvider;
  readonly imageOpen?: HostImageOpenDialogProvider;
  readonly message?: HostMessageDialogProvider;
  readonly photoCapture?: HostPhotoCaptureDialogProvider;
  readonly prompt?: HostPromptDialogProvider;
  readonly videoCapture?: HostVideoCaptureDialogProvider;
}

export interface HostGraphicsCapabilities {
  readonly bitmapEncode?: HostBitmapEncodeProvider;
  readonly bitmapReadback?: HostBitmapReadbackProvider;
  readonly image?: HostImageProvider;
  readonly pathBoolean?: HostPathBooleanProvider;
  readonly renderContext?: HostRenderContextProvider;
  readonly renderSurface?: HostRenderSurfaceProvider;
  readonly wgpuHost?: HostWgpuProvider;
}

export interface HostInputCapabilities {
  readonly dropFile?: HostInputDropFileProvider;
  readonly focus?: HostInputFocusProvider;
  readonly haptics?: HostHapticsProvider;
  readonly ingress?: HostInputIngressProvider;
  readonly pointerLock?: HostInputPointerLockProvider;
  readonly softKeyboardAccessoryBar?: HostSoftKeyboardAccessoryBarProvider;
  readonly softKeyboardChange?: HostSoftKeyboardChangeProvider;
  readonly softKeyboardInfo?: HostSoftKeyboardInfoProvider;
  readonly softKeyboardResizeModeWrite?: HostSoftKeyboardResizeModeWriteProvider;
  readonly softKeyboardScrollAssist?: HostSoftKeyboardScrollAssistProvider;
  readonly softKeyboardStyle?: HostSoftKeyboardStyleProvider;
  readonly softKeyboardVisibility?: HostSoftKeyboardVisibilityProvider;
  readonly target?: HostInputTargetProvider;
}

export interface HostIpcCapabilities {
  readonly handle?: HostIpcHandleProvider;
  readonly invoke?: HostIpcInvokeProvider;
  readonly message?: HostIpcMessageProvider;
  readonly send?: HostIpcSendProvider;
  readonly targetedSend?: HostIpcTargetedSendProvider;
}

export interface HostMediaCapabilities {
  readonly audioCodec?: HostAudioProvider;
  readonly audioDevice?: HostAudioDeviceProvider;
  readonly session?: HostMediaSessionProvider;
  readonly sessionAction?: HostMediaSessionActionProvider;
  readonly video?: HostVideoProvider;
}

// Menu is a top-level group rather than a ui slot: its three capabilities have different provider
// coverage AND incompatible shapes, so one combined provider could not represent them honestly. The group is
// non-optional like every other; the slots inside it are optional, and an omitted slot means the host
// genuinely lacks that capability — never a stub that answers false.
export interface HostMenuCapabilities {
  readonly application?: HostMenuApplicationProvider;
  readonly highlight?: HostMenuHighlightProvider;
  readonly popup?: HostMenuPopupProvider;
  readonly select?: HostMenuSelectProvider;
}

export interface HostMidiCapabilities {
  readonly access?: HostMidiAccessProvider;
  readonly permission?: HostMidiPermissionProvider;
}

export interface HostNetCapabilities {
  readonly http?: HostNetProvider;
  readonly socket?: HostSocketProvider;
}

export interface HostNotificationCapabilities {
  readonly action?: HostNotificationActionProvider;
  readonly activeList?: HostNotificationActiveListProvider;
  readonly click?: HostNotificationClickProvider;
  readonly close?: HostNotificationCloseProvider;
  readonly delivery?: HostNotificationDeliveryProvider;
  readonly dismiss?: HostNotificationDismissProvider;
  readonly lifecycle?: HostNotificationLifecycleProvider;
  readonly permission?: HostNotificationPermissionProvider;
  readonly received?: HostNotificationReceivedProvider;
  readonly reply?: HostNotificationReplyProvider;
  readonly scheduling?: HostNotificationSchedulingProvider;
}

// Share is top-level because content and Flight data-URL files have different provider coverage.
// Omission is capability absence; providers never install a stub that merely answers false.
export interface HostShareCapabilities {
  readonly content?: HostShareContentProvider;
  readonly files?: HostShareFilesProvider;
}

// Power is a top-level group: its capabilities vary independently by host (web has keep-awake and
// suspend/resume but no idle, session lock or battery health; electron has all of them), so one
// combined power provider could not represent any host honestly.
export interface HostPowerCapabilities {
  readonly batteryHealth?: HostPowerBatteryHealthProvider;
  readonly change?: HostPowerChangeProvider;
  readonly idle?: HostPowerIdleProvider;
  readonly keepAwake?: HostPowerKeepAwakeProvider;
  readonly sessionLock?: HostPowerSessionLockProvider;
  readonly status?: HostPowerStatusProvider;
  readonly suspension?: HostPowerSuspensionProvider;
  readonly thermal?: HostPowerThermalProvider;
}

export interface HostScreenCapabilities {
  readonly change?: HostScreenChangeProvider;
  readonly details?: HostScreenDetailsProvider;
  readonly permissionChange?: HostScreenPermissionChangeProvider;
  readonly query?: HostScreenQueryProvider;
}

export type WebScreenCapabilities = Entity & Required<HostScreenCapabilities>;

// Shell is top-level because its seven command capabilities have distinct provider coverage. Every
// Host names the group; omitted slots mean genuine absence, never a false-returning stub.
export interface HostShellCapabilities {
  readonly beep?: HostShellBeepProvider;
  readonly external?: HostShellExternalProvider;
  readonly pathOpen?: HostShellPathOpenProvider;
  readonly pathReveal?: HostShellPathRevealProvider;
  readonly process?: HostShellProcessProvider;
  readonly shortcutLink?: HostShellShortcutLinkProvider;
  readonly trash?: HostShellTrashProvider;
}

// Shortcut stays top-level because trigger is an event subscription and query is a command/result;
// both happen to have E/T coverage, but combining their incompatible shapes would hide that split.
export interface HostShortcutCapabilities {
  readonly query?: HostShortcutQueryProvider;
  readonly trigger?: HostShortcutTriggerProvider;
}

export interface HostStorageCapabilities {
  readonly change?: HostStorageChangeProvider;
  readonly fileSystem?: HostFileSystemProvider;
  readonly local?: HostStorageProvider;
  readonly persistenceQuery?: HostStoragePersistenceQueryProvider;
  readonly persistenceRequest?: HostStoragePersistenceRequestProvider;
}

export interface HostSystemCapabilities {
  readonly device?: HostDeviceProvider;
  readonly geolocation?: HostGeolocationProvider;
  readonly lifecycle?: HostLifecycleProvider;
  readonly platform?: HostPlatformProvider;
  readonly sensors?: HostSensorsProvider;
}

export interface HostTextCapabilities {
  readonly bidiClass?: HostBidiClassProvider;
  readonly fontLoading?: HostFontLoadingProvider;
  readonly glyphRasterizer?: HostGlyphRasterizerProvider;
  readonly segmenter?: HostTextSegmenterProvider;
  readonly shaper?: HostTextShaperProvider;
}

// Tray is top-level because command, query, and event coverage varies independently by native OS
// profile. The required group is stable; omitted slots mean genuine absence.
export interface HostTrayCapabilities {
  readonly balloon?: HostTrayBalloonProvider;
  readonly balloonEvents?: HostTrayBalloonEventsProvider;
  readonly bounds?: HostTrayBoundsProvider;
  readonly doubleClickPolicy?: HostTrayDoubleClickPolicyProvider;
  readonly dropEvents?: HostTrayDropEventsProvider;
  readonly image?: HostTrayImageProvider;
  readonly interactionEvents?: HostTrayInteractionEventsProvider;
  readonly lifecycle?: HostTrayLifecycleProvider;
  readonly menu?: HostTrayMenuProvider;
  readonly menuSelectionEvents?: HostTrayMenuSelectionEventsProvider;
  readonly popupMenu?: HostTrayPopupMenuProvider;
  readonly pressedImage?: HostTrayPressedImageProvider;
  readonly templateImage?: HostTrayTemplateImageProvider;
  readonly title?: HostTrayTitleProvider;
  readonly tooltip?: HostTrayTooltipProvider;
}

export interface HostUiCapabilities {
  readonly fullscreen?: HostFullscreenProvider;
  readonly statusBarChange?: HostStatusBarChangeProvider;
  readonly statusBarColor?: HostStatusBarColorProvider;
  readonly statusBarInfo?: HostStatusBarInfoProvider;
  readonly statusBarOverlays?: HostStatusBarOverlaysProvider;
  readonly statusBarStyle?: HostStatusBarStyleProvider;
  readonly statusBarVisibility?: HostStatusBarVisibilityProvider;
}

export interface HostUpdaterCapabilities {
  readonly command?: HostUpdaterCommandProvider;
}
