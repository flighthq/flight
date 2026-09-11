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

// Transitional compatibility names for the independently compiling types-first checkpoint.
// Builder3 removes this block together with the nested host Has* witnesses after consumers use
// the direct Host*Provider leaves. Do not add new Backend names here.
export type AccessibilityBackend = HostAccessibilityProvider;
export type AppActivateBackend = HostAppActivateProvider;
export type AppActivationPolicyBackend = HostAppActivationPolicyProvider;
export type AppAllWindowsClosedBackend = HostAppAllWindowsClosedProvider;
export type AppBadgeBackend = HostAppBadgeProvider;
export type AppDockBackend = HostAppDockProvider;
export type AppFocusBackend = HostAppFocusProvider;
export type AppHideBackend = HostAppHideProvider;
export type ApplicationExitBackend = HostApplicationExitProvider;
export type ApplicationVisibilityBackend = HostApplicationVisibilityProvider;
export type AppLocaleBackend = HostAppLocaleProvider;
export type AppLoginItemBackend = HostAppLoginItemProvider;
export type AppNameBackend = HostAppNameProvider;
export type AppNameWriteBackend = HostAppNameWriteProvider;
export type AppOpenFileBackend = HostAppOpenFileProvider;
export type AppPathBackend = HostAppPathProvider;
export type AppQuitBackend = HostAppQuitProvider;
export type AppQuitRequestBackend = HostAppQuitRequestProvider;
export type AppReadyBackend = HostAppReadyProvider;
export type AppRecentDocumentsBackend = HostAppRecentDocumentsProvider;
export type AppRelaunchBackend = HostAppRelaunchProvider;
export type AppSecondInstanceBackend = HostAppSecondInstanceProvider;
export type AppShowBackend = HostAppShowProvider;
export type AppSingleInstanceBackend = HostAppSingleInstanceProvider;
export type AppUserModelIdBackend = HostAppUserModelIdProvider;
export type AppVersionBackend = HostAppVersionProvider;
export type AppVisibilityQueryBackend = HostAppVisibilityQueryProvider;
export type AudioBackend = HostAudioProvider;
export type AudioDeviceBackend = HostAudioDeviceProvider;
export type BidiClassBackend = HostBidiClassProvider;
export type BitmapEncodeBackend = HostBitmapEncodeProvider;
export type BitmapReadbackBackend = HostBitmapReadbackProvider;
export type ClipboardBookmarkBackend = HostClipboardBookmarkProvider;
export type ClipboardChangeBackend = HostClipboardChangeProvider;
export type ClipboardFormatsBackend = HostClipboardFormatsProvider;
export type ClipboardImageBackend = HostClipboardImageProvider;
export type ClipboardTextBackend = HostClipboardTextProvider;
export type ConnectivityChangeBackend = HostConnectivityChangeProvider;
export type ConnectivityReachabilityBackend = HostConnectivityReachabilityProvider;
export type ConnectivityStatusBackend = HostConnectivityStatusProvider;
export type DeviceBackend = HostDeviceProvider;
export type DirectoryOpenDialogBackend = HostDirectoryOpenDialogProvider;
export type FileOpenDialogBackend = HostFileOpenDialogProvider;
export type FileSaveDialogBackend = HostFileSaveDialogProvider;
export type FileSystemHostBackend = HostFileSystemProvider;
export type FontLoadingBackend = HostFontLoadingProvider;
export type FullscreenBackend = HostFullscreenProvider;
export type GeolocationBackend = HostGeolocationProvider;
export type GlyphRasterizerBackend = HostGlyphRasterizerProvider;
export type HapticsBackend = HostHapticsProvider;
export type ImageBackend = HostImageProvider;
export type ImageOpenDialogBackend = HostImageOpenDialogProvider;
export type InputDropFileBackend = HostInputDropFileProvider;
export type InputFocusBackend = HostInputFocusProvider;
export type InputIngressBackend = HostInputIngressProvider;
export type InputPointerLockBackend = HostInputPointerLockProvider;
export type InputTargetBackend = HostInputTargetProvider;
export type IpcHandleBackend = HostIpcHandleProvider;
export type IpcInvokeBackend = HostIpcInvokeProvider;
export type IpcMessageBackend = HostIpcMessageProvider;
export type IpcSendBackend = HostIpcSendProvider;
export type IpcTargetedSendBackend<Target = never> = HostIpcTargetedSendProvider<Target>;
export type LifecycleBackend = HostLifecycleProvider;
export type LoopBackend = HostLoopProvider;
export type MediaSessionActionBackend = HostMediaSessionActionProvider;
export type MediaSessionBackend = HostMediaSessionProvider;
export type MenuApplicationBackend = HostMenuApplicationProvider;
export type MenuHighlightBackend = HostMenuHighlightProvider;
export type MenuPopupBackend = HostMenuPopupProvider;
export type MenuSelectBackend = HostMenuSelectProvider;
export type MessageDialogBackend = HostMessageDialogProvider;
export type MidiAccessBackend = HostMidiAccessProvider;
export type MidiPermissionBackend = HostMidiPermissionProvider;
export type NetBackend = HostNetProvider;
export type NotificationActionBackend = HostNotificationActionProvider;
export type NotificationActiveListBackend = HostNotificationActiveListProvider;
export type NotificationClickBackend = HostNotificationClickProvider;
export type NotificationCloseBackend = HostNotificationCloseProvider;
export type NotificationDeliveryBackend = HostNotificationDeliveryProvider;
export type NotificationDismissBackend = HostNotificationDismissProvider;
export type NotificationLifecycleBackend = HostNotificationLifecycleProvider;
export type NotificationPermissionBackend = HostNotificationPermissionProvider;
export type NotificationReceivedBackend = HostNotificationReceivedProvider;
export type NotificationReplyBackend = HostNotificationReplyProvider;
export type NotificationSchedulingBackend = HostNotificationSchedulingProvider;
export type PathBooleanBackend = HostPathBooleanProvider;
export type PhotoCaptureDialogBackend = HostPhotoCaptureDialogProvider;
export type PlatformBackend = HostPlatformProvider;
export type PowerBatteryHealthBackend = HostPowerBatteryHealthProvider;
export type PowerChangeBackend = HostPowerChangeProvider;
export type PowerIdleBackend = HostPowerIdleProvider;
export type PowerKeepAwakeBackend = HostPowerKeepAwakeProvider;
export type PowerSessionLockBackend = HostPowerSessionLockProvider;
export type PowerStatusBackend = HostPowerStatusProvider;
export type PowerSuspensionBackend = HostPowerSuspensionProvider;
export type PowerThermalBackend = HostPowerThermalProvider;
export type PromptDialogBackend = HostPromptDialogProvider;
export type ProtocolDefaultBackend = HostProtocolDefaultProvider;
export type ProtocolLaunchBackend = HostProtocolLaunchProvider;
export type ProtocolOpenBackend = HostProtocolOpenProvider;
export type ProtocolRegistrationBackend = HostProtocolRegistrationProvider;
export type ProtocolRegistrationQueryBackend = HostProtocolRegistrationQueryProvider;
export type ProtocolUnregistrationBackend = HostProtocolUnregistrationProvider;
export type RenderContextBackend = HostRenderContextProvider;
export type RenderSurfaceBackend = HostRenderSurfaceProvider;
export type ScreenChangeBackend = HostScreenChangeProvider;
export type ScreenDetailsBackend = HostScreenDetailsProvider;
export type ScreenPermissionChangeBackend = HostScreenPermissionChangeProvider;
export type ScreenQueryBackend = HostScreenQueryProvider;
export type SensorsBackend = HostSensorsProvider;
export type ShareContentBackend = HostShareContentProvider;
export type ShareFilesBackend = HostShareFilesProvider;
export type ShellBeepBackend = HostShellBeepProvider;
export type ShellExternalBackend = HostShellExternalProvider;
export type ShellPathOpenBackend = HostShellPathOpenProvider;
export type ShellPathRevealBackend = HostShellPathRevealProvider;
export type ShellProcessBackend = HostShellProcessProvider;
export type ShellShortcutLinkBackend = HostShellShortcutLinkProvider;
export type ShellTrashBackend = HostShellTrashProvider;
export type ShortcutQueryBackend = HostShortcutQueryProvider;
export type ShortcutTriggerBackend = HostShortcutTriggerProvider;
export type SocketBackend = HostSocketProvider;
export type SoftKeyboardAccessoryBarBackend = HostSoftKeyboardAccessoryBarProvider;
export type SoftKeyboardChangeBackend = HostSoftKeyboardChangeProvider;
export type SoftKeyboardInfoBackend = HostSoftKeyboardInfoProvider;
export type SoftKeyboardResizeModeWriteBackend = HostSoftKeyboardResizeModeWriteProvider;
export type SoftKeyboardScrollAssistBackend = HostSoftKeyboardScrollAssistProvider;
export type SoftKeyboardStyleBackend = HostSoftKeyboardStyleProvider;
export type SoftKeyboardVisibilityBackend = HostSoftKeyboardVisibilityProvider;
export type StatusBarChangeBackend = HostStatusBarChangeProvider;
export type StatusBarColorBackend = HostStatusBarColorProvider;
export type StatusBarInfoBackend = HostStatusBarInfoProvider;
export type StatusBarOverlaysBackend = HostStatusBarOverlaysProvider;
export type StatusBarStyleBackend = HostStatusBarStyleProvider;
export type StatusBarVisibilityBackend = HostStatusBarVisibilityProvider;
export type StorageBackend = HostStorageProvider;
export type StorageChangeBackend = HostStorageChangeProvider;
export type StoragePersistenceQueryBackend = HostStoragePersistenceQueryProvider;
export type StoragePersistenceRequestBackend = HostStoragePersistenceRequestProvider;
export type TextSegmenterBackend = HostTextSegmenterProvider;
export type TextShaperBackend = HostTextShaperProvider;
export type TrayBalloonBackend = HostTrayBalloonProvider;
export type TrayBalloonEventsBackend = HostTrayBalloonEventsProvider;
export type TrayBoundsBackend = HostTrayBoundsProvider;
export type TrayDoubleClickPolicyBackend = HostTrayDoubleClickPolicyProvider;
export type TrayDropEventsBackend = HostTrayDropEventsProvider;
export type TrayImageBackend = HostTrayImageProvider;
export type TrayInteractionEventsBackend = HostTrayInteractionEventsProvider;
export type TrayLifecycleBackend = HostTrayLifecycleProvider;
export type TrayMenuBackend = HostTrayMenuProvider;
export type TrayMenuSelectionEventsBackend = HostTrayMenuSelectionEventsProvider;
export type TrayPopupMenuBackend = HostTrayPopupMenuProvider;
export type TrayPressedImageBackend = HostTrayPressedImageProvider;
export type TrayTemplateImageBackend = HostTrayTemplateImageProvider;
export type TrayTitleBackend = HostTrayTitleProvider;
export type TrayTooltipBackend = HostTrayTooltipProvider;
export type UpdaterCommandBackend = HostUpdaterCommandProvider;
export type VideoCapabilityBackend = HostVideoProvider;
export type VideoCaptureDialogBackend = HostVideoCaptureDialogProvider;
export type WgpuHostBackend = HostWgpuProvider;
export type WindowBackend = HostWindowProvider;
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
// coverage AND incompatible shapes, so one MenuBackend could not represent them honestly. The group is
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
// PowerBackend could not represent any host honestly.
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

// Transitional nested witnesses retained only until direct-provider consumer migration.
// Mapping ledger for that final collapse:
// - HasClipboardChange narrows HostClipboardChangeProvider to its required subscription pair.
// - HasUiFullscreen and HasUiFullscreenSubscription share HostFullscreenProvider; the latter narrows it.
// - the seven HasWindow* witnesses narrow different portions of the single HostWindowProvider.
// - HasUiStatusBarStyleStack aggregates five independently mapped status-bar providers.
// - HostShellProcessProvider had no Has* witness; ShellProcessHost remains its transitional wrapper.
// These are not additional providers: every name above resolves to an actual Host leaf interface.
export interface HasAccessibilityProvider {
  readonly accessibility: { readonly provider: HostAccessibilityProvider };
}

export interface HasAppExitSubscription {
  readonly app: { readonly exit: HostApplicationExitProvider };
}

export interface HasAppActivate {
  readonly app: { readonly activate: HostAppActivateProvider };
}

export interface HasAppActivationPolicy {
  readonly app: { readonly activationPolicy: HostAppActivationPolicyProvider };
}

export interface HasAppAllWindowsClosed {
  readonly app: { readonly allWindowsClosed: HostAppAllWindowsClosedProvider };
}

export interface HasAppBadge {
  readonly app: { readonly badge: HostAppBadgeProvider };
}

export interface HasAppDock {
  readonly app: { readonly dock: HostAppDockProvider };
}

export interface HasAppFocus {
  readonly app: { readonly focus: HostAppFocusProvider };
}

export interface HasAppLocale {
  readonly app: { readonly locale: HostAppLocaleProvider };
}

export interface HasAppLoginItem {
  readonly app: { readonly loginItem: HostAppLoginItemProvider };
}

export interface HasAppName {
  readonly app: { readonly name: HostAppNameProvider };
}

export interface HasAppNameWrite {
  readonly app: { readonly nameWrite: HostAppNameWriteProvider };
}

export interface HasAppOpenFile {
  readonly app: { readonly openFile: HostAppOpenFileProvider };
}

export interface HasAppPath {
  readonly app: { readonly path: HostAppPathProvider };
}

export interface HasAppHide {
  readonly app: { readonly hide: HostAppHideProvider };
}

export interface HasAppHiddenQuery {
  readonly app: { readonly hiddenQuery: HostAppVisibilityQueryProvider };
}

export interface HasAppQuit {
  readonly app: { readonly quit: HostAppQuitProvider };
}

export interface HasAppQuitRequest {
  readonly app: { readonly quitRequest: HostAppQuitRequestProvider };
}

export interface HasAppReady {
  readonly app: { readonly ready: HostAppReadyProvider };
}

export interface HasAppRecentDocuments {
  readonly app: { readonly recentDocuments: HostAppRecentDocumentsProvider };
}

export interface HasAppRelaunch {
  readonly app: { readonly relaunch: HostAppRelaunchProvider };
}

export interface HasAppSecondInstance {
  readonly app: { readonly secondInstance: HostAppSecondInstanceProvider };
}

export interface HasAppShow {
  readonly app: { readonly show: HostAppShowProvider };
}

export interface HasAppSingleInstance {
  readonly app: { readonly singleInstance: HostAppSingleInstanceProvider };
}

export interface HasAppUserModelId {
  readonly app: { readonly userModelId: HostAppUserModelIdProvider };
}

export interface HasAppVersion {
  readonly app: { readonly version: HostAppVersionProvider };
}

export interface HasProtocolDefault {
  readonly protocol: { readonly default: HostProtocolDefaultProvider };
}

export interface HasProtocolLaunch {
  readonly protocol: { readonly launch: HostProtocolLaunchProvider };
}

export interface HasProtocolOpen {
  readonly protocol: { readonly open: HostProtocolOpenProvider };
}

export interface HasProtocolRegistration {
  readonly protocol: { readonly registration: HostProtocolRegistrationProvider };
}

export interface HasProtocolRegistrationQuery {
  readonly protocol: { readonly registrationQuery: HostProtocolRegistrationQueryProvider };
}

export interface HasProtocolUnregistration {
  readonly protocol: { readonly unregistration: HostProtocolUnregistrationProvider };
}

export interface HasAppLoop {
  readonly app: { readonly loop: HostLoopProvider };
}

export interface HasUpdaterCommand {
  readonly updater: { readonly command: HostUpdaterCommandProvider };
}

export interface HasShortcutQuery {
  readonly shortcut: { readonly query: HostShortcutQueryProvider };
}

export interface HasShortcutTrigger {
  readonly shortcut: { readonly trigger: HostShortcutTriggerProvider };
}

export interface HasAppVisibilityQuery {
  readonly app: { readonly visibility: HostApplicationVisibilityProvider };
}

export interface HasClipboardBookmark {
  readonly clipboard: { readonly bookmark: HostClipboardBookmarkProvider };
}

export interface HasClipboardChange {
  readonly clipboard: {
    readonly change: Required<Pick<HostClipboardChangeProvider, 'subscribe' | 'unsubscribe'>>;
  };
}

export interface HasClipboardFormats {
  readonly clipboard: { readonly formats: HostClipboardFormatsProvider };
}

export interface HasClipboardImage {
  readonly clipboard: { readonly image: HostClipboardImageProvider };
}

export interface HasClipboardText {
  readonly clipboard: { readonly text: HostClipboardTextProvider };
}
export interface HasConnectivityChange {
  readonly connectivity: { readonly change: HostConnectivityChangeProvider };
}
export interface HasConnectivityReachability {
  readonly connectivity: {
    readonly reachability: HostConnectivityReachabilityProvider;
  };
}
export interface HasConnectivityStatus {
  readonly connectivity: { readonly status: HostConnectivityStatusProvider };
}
export interface HasDialogDirectoryOpen {
  readonly dialog: { readonly directoryOpen: HostDirectoryOpenDialogProvider };
}

export interface HasDialogFileOpen {
  readonly dialog: { readonly fileOpen: HostFileOpenDialogProvider };
}

export interface HasDialogFileSave {
  readonly dialog: { readonly fileSave: HostFileSaveDialogProvider };
}

export interface HasDialogImageOpen {
  readonly dialog: { readonly imageOpen: HostImageOpenDialogProvider };
}

export interface HasDialogMessage {
  readonly dialog: { readonly message: HostMessageDialogProvider };
}

export interface HasDialogPhotoCapture {
  readonly dialog: { readonly photoCapture: HostPhotoCaptureDialogProvider };
}

export interface HasDialogPrompt {
  readonly dialog: { readonly prompt: HostPromptDialogProvider };
}

export interface HasDialogVideoCapture {
  readonly dialog: { readonly videoCapture: HostVideoCaptureDialogProvider };
}

export interface HasGraphicsBitmapEncode {
  readonly graphics: { readonly bitmapEncode: HostBitmapEncodeProvider };
}

export interface HasGraphicsBitmapReadback {
  readonly graphics: { readonly bitmapReadback: HostBitmapReadbackProvider };
}

export interface HasGraphicsImage {
  readonly graphics: { readonly image: HostImageProvider };
}

export interface HasGraphicsPathBoolean {
  readonly graphics: { readonly pathBoolean: HostPathBooleanProvider };
}

export interface HasGraphicsRenderContextSubscription {
  readonly graphics: { readonly renderContext: HostRenderContextProvider };
}

export interface HasGraphicsRenderSurface {
  readonly graphics: { readonly renderSurface: HostRenderSurfaceProvider };
}

export interface HasGraphicsWgpuHost {
  readonly graphics: { readonly wgpuHost: HostWgpuProvider };
}

export interface HasInputDropFileSubscription {
  readonly input: { readonly dropFile: HostInputDropFileProvider };
}

export interface HasInputFocusSubscription {
  readonly input: { readonly focus: HostInputFocusProvider };
}

export interface HasInputHaptics {
  readonly input: { readonly haptics: HostHapticsProvider };
}

export interface HasInputIngress {
  readonly input: { readonly ingress: HostInputIngressProvider };
}

export interface HasInputPointerLock {
  readonly input: { readonly pointerLock: HostInputPointerLockProvider };
}

export interface HasInputTargetPreparation {
  readonly input: { readonly target: HostInputTargetProvider };
}

export interface HasSoftKeyboardAccessoryBar {
  readonly input: {
    readonly softKeyboardAccessoryBar: HostSoftKeyboardAccessoryBarProvider;
  };
}

export interface HasSoftKeyboardChange {
  readonly input: { readonly softKeyboardChange: HostSoftKeyboardChangeProvider };
}

export interface HasSoftKeyboardInfo {
  readonly input: { readonly softKeyboardInfo: HostSoftKeyboardInfoProvider };
}

export interface HasSoftKeyboardResizeModeWrite {
  readonly input: {
    readonly softKeyboardResizeModeWrite: HostSoftKeyboardResizeModeWriteProvider;
  };
}

export interface HasSoftKeyboardScrollAssist {
  readonly input: {
    readonly softKeyboardScrollAssist: HostSoftKeyboardScrollAssistProvider;
  };
}

export interface HasSoftKeyboardStyle {
  readonly input: { readonly softKeyboardStyle: HostSoftKeyboardStyleProvider };
}

export interface HasSoftKeyboardVisibility {
  readonly input: {
    readonly softKeyboardVisibility: HostSoftKeyboardVisibilityProvider;
  };
}

export interface HasIpcHandle {
  readonly ipc: { readonly handle: HostIpcHandleProvider };
}

export interface HasIpcInvoke {
  readonly ipc: { readonly invoke: HostIpcInvokeProvider };
}

export interface HasIpcMessage {
  readonly ipc: { readonly message: HostIpcMessageProvider };
}

export interface HasIpcSend {
  readonly ipc: { readonly send: HostIpcSendProvider };
}

export interface HasIpcTargetedSend<Target> {
  readonly ipc: { readonly targetedSend: HostIpcTargetedSendProvider<Target> };
}

export interface HasMediaAudioCodec {
  readonly media: { readonly audioCodec: HostAudioProvider };
}

export interface HasMediaAudioDevice {
  readonly media: { readonly audioDevice: HostAudioDeviceProvider };
}

export interface HasMediaSession {
  readonly media: { readonly session: HostMediaSessionProvider };
}

export interface HasMediaSessionAction {
  readonly media: { readonly sessionAction: HostMediaSessionActionProvider };
}

export interface HasMediaVideo {
  readonly media: { readonly video: HostVideoProvider };
}

export interface HasNetHttp {
  readonly net: { readonly http: HostNetProvider };
}

export interface HasNetSocket {
  readonly net: { readonly socket: HostSocketProvider };
}

export interface HasMidiAccess {
  readonly midi: { readonly access: HostMidiAccessProvider };
}

export interface HasMidiPermission {
  readonly midi: { readonly permission: HostMidiPermissionProvider };
}

export interface HasNotificationAction {
  readonly notification: { readonly action: HostNotificationActionProvider };
}

export interface HasNotificationActiveList {
  readonly notification: { readonly activeList: HostNotificationActiveListProvider };
}

export interface HasNotificationClick {
  readonly notification: { readonly click: HostNotificationClickProvider };
}

export interface HasNotificationClose {
  readonly notification: { readonly close: HostNotificationCloseProvider };
}

export interface HasNotificationDelivery {
  readonly notification: { readonly delivery: HostNotificationDeliveryProvider };
}

export interface HasNotificationDismiss {
  readonly notification: { readonly dismiss: HostNotificationDismissProvider };
}

export interface HasNotificationLifecycle {
  readonly notification: { readonly lifecycle: HostNotificationLifecycleProvider };
}

export interface HasNotificationPermission {
  readonly notification: { readonly permission: HostNotificationPermissionProvider };
}

export interface HasNotificationReceived {
  readonly notification: { readonly received: HostNotificationReceivedProvider };
}

export interface HasNotificationReply {
  readonly notification: { readonly reply: HostNotificationReplyProvider };
}

export interface HasNotificationScheduling {
  readonly notification: { readonly scheduling: HostNotificationSchedulingProvider };
}

export interface HasStorageFileSystem {
  readonly storage: { readonly fileSystem: HostFileSystemProvider };
}

export interface HasPowerBatteryHealth {
  readonly power: { readonly batteryHealth: HostPowerBatteryHealthProvider };
}

export interface HasPowerChange {
  readonly power: { readonly change: HostPowerChangeProvider };
}

export interface HasPowerIdle {
  readonly power: { readonly idle: HostPowerIdleProvider };
}

export interface HasPowerKeepAwake {
  readonly power: { readonly keepAwake: HostPowerKeepAwakeProvider };
}

export interface HasPowerSessionLock {
  readonly power: { readonly sessionLock: HostPowerSessionLockProvider };
}

export interface HasPowerStatus {
  readonly power: { readonly status: HostPowerStatusProvider };
}

export interface HasPowerSuspension {
  readonly power: { readonly suspension: HostPowerSuspensionProvider };
}

export interface HasPowerThermal {
  readonly power: { readonly thermal: HostPowerThermalProvider };
}

export interface HasStorageChange {
  readonly storage: { readonly change: HostStorageChangeProvider };
}

export interface HasStorageLocal {
  readonly storage: { readonly local: HostStorageProvider };
}

export interface HasStoragePersistenceQuery {
  readonly storage: { readonly persistenceQuery: HostStoragePersistenceQueryProvider };
}

export interface HasStoragePersistenceRequest {
  readonly storage: { readonly persistenceRequest: HostStoragePersistenceRequestProvider };
}

export interface HasSystemDevice {
  readonly system: { readonly device: HostDeviceProvider };
}

export interface HasSystemGeolocation {
  readonly system: { readonly geolocation: HostGeolocationProvider };
}

export interface HasSystemLifecycle {
  readonly system: { readonly lifecycle: HostLifecycleProvider };
}

export interface HasSystemPlatform {
  readonly system: { readonly platform: HostPlatformProvider };
}

export interface HasScreenChange {
  readonly screen: { readonly change: HostScreenChangeProvider };
}

export interface HasScreenDetails {
  readonly screen: { readonly details: HostScreenDetailsProvider };
}

export interface HasScreenPermissionChange {
  readonly screen: { readonly permissionChange: HostScreenPermissionChangeProvider };
}

export interface HasScreenQuery {
  readonly screen: { readonly query: HostScreenQueryProvider };
}

export interface HasSystemSensors {
  readonly system: { readonly sensors: HostSensorsProvider };
}

export interface HasTextBidiClass {
  readonly text: { readonly bidiClass: HostBidiClassProvider };
}

export interface HasTextFontLoading {
  readonly text: { readonly fontLoading: HostFontLoadingProvider };
}

export interface HasTextGlyphRasterizer {
  readonly text: { readonly glyphRasterizer: HostGlyphRasterizerProvider };
}

export interface HasTextSegmenter {
  readonly text: { readonly segmenter: HostTextSegmenterProvider };
}

export interface HasTextShaper {
  readonly text: { readonly shaper: HostTextShaperProvider };
}

export interface HasUiFullscreen {
  readonly ui: { readonly fullscreen: HostFullscreenProvider };
}

export interface HasUiFullscreenSubscription {
  readonly ui: {
    readonly fullscreen: Required<Pick<HostFullscreenProvider, 'subscribe' | 'unsubscribe'>>;
  };
}

export interface HasMenuApplication {
  readonly menu: { readonly application: HostMenuApplicationProvider };
}

export interface HasMenuHighlight {
  readonly menu: { readonly highlight: HostMenuHighlightProvider };
}

export interface HasMenuPopup {
  readonly menu: { readonly popup: HostMenuPopupProvider };
}

export interface HasMenuSelect {
  readonly menu: { readonly select: HostMenuSelectProvider };
}

export interface HasShareContent {
  readonly share: { readonly content: HostShareContentProvider };
}

export interface HasShareFiles {
  readonly share: { readonly files: HostShareFilesProvider };
}

export interface HasShellBeep {
  readonly shell: { readonly beep: HostShellBeepProvider };
}

export interface HasShellExternal {
  readonly shell: { readonly external: HostShellExternalProvider };
}

export interface HasShellPathOpen {
  readonly shell: { readonly pathOpen: HostShellPathOpenProvider };
}

export interface HasShellPathReveal {
  readonly shell: { readonly pathReveal: HostShellPathRevealProvider };
}

export interface HasShellShortcutLink {
  readonly shell: { readonly shortcutLink: HostShellShortcutLinkProvider };
}

export interface HasShellTrash {
  readonly shell: { readonly trash: HostShellTrashProvider };
}

export interface HasUiStatusBarChange {
  readonly ui: { readonly statusBarChange: HostStatusBarChangeProvider };
}

export interface HasUiStatusBarColor {
  readonly ui: { readonly statusBarColor: HostStatusBarColorProvider };
}

export interface HasUiStatusBarInfo {
  readonly ui: { readonly statusBarInfo: HostStatusBarInfoProvider };
}

export interface HasUiStatusBarOverlays {
  readonly ui: { readonly statusBarOverlays: HostStatusBarOverlaysProvider };
}

export interface HasUiStatusBarStyle {
  readonly ui: { readonly statusBarStyle: HostStatusBarStyleProvider };
}

export type HasUiStatusBarStyleStack = HasUiStatusBarColor &
  HasUiStatusBarInfo &
  HasUiStatusBarOverlays &
  HasUiStatusBarStyle &
  HasUiStatusBarVisibility;

export interface HasUiStatusBarVisibility {
  readonly ui: { readonly statusBarVisibility: HostStatusBarVisibilityProvider };
}

export interface HasTrayLifecycle {
  readonly tray: { readonly lifecycle: HostTrayLifecycleProvider };
}

export interface HasTrayImage {
  readonly tray: { readonly image: HostTrayImageProvider };
}

export interface HasTrayTitle {
  readonly tray: { readonly title: HostTrayTitleProvider };
}

export interface HasTrayTooltip {
  readonly tray: { readonly tooltip: HostTrayTooltipProvider };
}

export interface HasTrayMenu {
  readonly tray: { readonly menu: HostTrayMenuProvider };
}

export interface HasTrayTemplateImage {
  readonly tray: { readonly templateImage: HostTrayTemplateImageProvider };
}

export interface HasTrayBounds {
  readonly tray: { readonly bounds: HostTrayBoundsProvider };
}

export interface HasTrayPopupMenu {
  readonly tray: { readonly popupMenu: HostTrayPopupMenuProvider };
}

export interface HasTrayDoubleClickPolicy {
  readonly tray: { readonly doubleClickPolicy: HostTrayDoubleClickPolicyProvider };
}

export interface HasTrayPressedImage {
  readonly tray: { readonly pressedImage: HostTrayPressedImageProvider };
}

export interface HasTrayBalloon {
  readonly tray: { readonly balloon: HostTrayBalloonProvider };
}

export interface HasTrayInteractionEvents {
  readonly tray: { readonly interactionEvents: HostTrayInteractionEventsProvider };
}

export interface HasTrayMenuSelectionEvents {
  readonly tray: {
    readonly menuSelectionEvents: HostTrayMenuSelectionEventsProvider;
  };
}

export interface HasTrayBalloonEvents {
  readonly tray: { readonly balloonEvents: HostTrayBalloonEventsProvider };
}

export interface HasTrayDropEvents {
  readonly tray: { readonly dropEvents: HostTrayDropEventsProvider };
}

export interface HasWindowAttach {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'attach' | 'close'>>;
}

export interface HasWindowCloseSubscription {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeClose'>>;
}

export interface HasWindowMoveSubscription {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeMove'>>;
}

export interface HasWindowOpen {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'close' | 'open'>>;
}

export interface HasWindowOrientationSubscription {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeOrientation'>>;
}

export interface HasWindowResizeSubscription {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeResize'>>;
}

export interface HasWindowVisibilitySubscription {
  readonly window: HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeVisibility'>>;
}
