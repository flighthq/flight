import type { HostAccessibilityCapability } from './Accessibility';
import type {
  HostAppActivateCapability,
  HostAppActivationPolicyCapability,
  HostAppAllWindowsClosedCapability,
  HostAppBadgeCapability,
  HostAppDockCapability,
  HostAppFocusCapability,
  HostAppHideCapability,
  HostAppLocaleCapability,
  HostAppLoginItemCapability,
  HostAppNameCapability,
  HostAppNameWriteCapability,
  HostAppOpenFileCapability,
  HostAppPathCapability,
  HostAppQuitCapability,
  HostAppQuitRequestCapability,
  HostAppReadyCapability,
  HostAppRecentDocumentsCapability,
  HostAppRelaunchCapability,
  HostAppSecondInstanceCapability,
  HostAppSingleInstanceCapability,
  HostAppUserModelIdCapability,
  HostAppVersionCapability,
  HostAppShowCapability,
  HostAppVisibilityQueryCapability,
} from './App';
import type { HostApplicationExitCapability } from './ApplicationExitBackend';
import type { HostApplicationVisibilityCapability } from './ApplicationVisibilityBackend';
import type { HostWindowCapability } from './ApplicationWindow';
import type {
  HostInputDropFileCapability,
  HostInputFocusCapability,
  HostInputPointerLockCapability,
  HostRenderContextCapability,
  HostRenderSurfaceCapability,
} from './ApplicationWindowTargetBackend';
import type { HostAudioCapability } from './AudioBackend';
import type { HostAudioDeviceCapability } from './AudioDeviceBackend';
import type { HostAudioMixerCapability } from './AudioMixerBackend';
import type { HostBitmapEncodeCapability } from './BitmapEncodeBackend';
import type { HostBitmapReadbackCapability } from './BitmapReadbackBackend';
import type {
  HostClipboardBookmarkCapability,
  HostClipboardChangeCapability,
  HostClipboardFormatsCapability,
  HostClipboardImageCapability,
  HostClipboardTextCapability,
} from './Clipboard';
import type {
  HostConnectivityChangeCapability,
  HostConnectivityReachabilityCapability,
  HostConnectivityStatusCapability,
} from './Connectivity';
import type { HostDeviceCapability } from './Device';
import type { Entity } from './Entity';
import type {
  HostDirectoryOpenDialogCapability,
  HostFileOpenDialogCapability,
  HostFileSaveDialogCapability,
} from './FileDialogBackend';
import type { HostFileSystemCapability } from './FileSystem';
import type { HostFontLoadingCapability } from './FontLoadingBackend';
import type { HostFullscreenCapability } from './FullscreenBackend';
import type { HostGeolocationCapability } from './Geolocation';
import type { HostGlyphRasterizerCapability } from './GlyphSource';
import type { HostHapticsCapability } from './Haptics';
import type { HostImageOpenDialogCapability } from './ImageOpenDialogBackend';
import type { HostImageCapability } from './ImageResource';
import type { HostInputIngressCapability } from './InputIngressBackend';
import type { HostInputTargetCapability } from './InputTargetBackend';
import type {
  HostIpcHandleCapability,
  HostIpcInvokeCapability,
  HostIpcMessageCapability,
  HostIpcSendCapability,
  HostIpcTargetedSendCapability,
} from './Ipc';
import type {
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardChangeCapability,
  HostSoftKeyboardInfoCapability,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardScrollAssistCapability,
  HostSoftKeyboardStyleCapability,
  HostSoftKeyboardVisibilityCapability,
} from './Keyboard';
import type { HostLifecycleCapability } from './Lifecycle';
import type { HostLoopCapability } from './LoopBackend';
import type { HostMediaSessionActionCapability, HostMediaSessionCapability } from './MediaSession';
import type {
  HostMenuApplicationCapability,
  HostMenuHighlightCapability,
  HostMenuPopupCapability,
  HostMenuSelectCapability,
} from './Menu';
import type { HostMessageDialogCapability } from './MessageDialogBackend';
import type { HostMidiAccessCapability, HostMidiPermissionCapability } from './Midi';
import type { HostNetCapability } from './Net';
import type {
  HostNotificationActionCapability,
  HostNotificationActiveListCapability,
  HostNotificationClickCapability,
  HostNotificationCloseCapability,
  HostNotificationDeliveryCapability,
  HostNotificationDismissCapability,
  HostNotificationLifecycleCapability,
  HostNotificationPermissionCapability,
  HostNotificationReceivedCapability,
  HostNotificationReplyCapability,
  HostNotificationSchedulingCapability,
} from './Notification';
import type { HostPermissionsCapability } from './Permission';
import type { HostPhotoCaptureDialogCapability } from './PhotoCaptureDialogBackend';
import type { HostPlatformCapability } from './Platform';
import type {
  HostPowerBatteryHealthCapability,
  HostPowerChangeCapability,
  HostPowerIdleCapability,
  HostPowerKeepAwakeCapability,
  HostPowerSessionLockCapability,
  HostPowerStatusCapability,
  HostPowerSuspensionCapability,
  HostPowerThermalCapability,
} from './Power';
import type { HostPromptDialogCapability } from './PromptDialogBackend';
import type {
  HostProtocolDefaultCapability,
  HostProtocolLaunchCapability,
  HostProtocolOpenCapability,
  HostProtocolRegistrationCapability,
  HostProtocolRegistrationQueryCapability,
  HostProtocolUnregistrationCapability,
} from './Protocol';
import type {
  HostScreenChangeCapability,
  HostScreenDetailsCapability,
  HostScreenPermissionChangeCapability,
  HostScreenQueryCapability,
} from './Screen';
import type { HostSensorsCapability } from './Sensors';
import type { HostShareContentCapability, HostShareFilesCapability } from './Share';
import type {
  HostShellBeepCapability,
  HostShellExternalCapability,
  HostShellPathOpenCapability,
  HostShellPathRevealCapability,
  HostShellProcessCapability,
  HostShellShortcutLinkCapability,
  HostShellTrashCapability,
} from './Shell';
import type { HostShortcutQueryCapability, HostShortcutTriggerCapability } from './Shortcut';
import type { HostSocketCapability } from './Socket';
import type {
  HostStatusBarChangeCapability,
  HostStatusBarColorCapability,
  HostStatusBarInfoCapability,
  HostStatusBarOverlaysCapability,
  HostStatusBarStyleCapability,
  HostStatusBarVisibilityCapability,
} from './StatusBar';
import type {
  HostStorageCapability,
  HostStorageChangeCapability,
  HostStoragePersistenceQueryCapability,
  HostStoragePersistenceRequestCapability,
} from './Storage';
import type { HostTextSegmenterCapability } from './TextSegment';
import type { HostTextShaperCapability } from './TextShaper';
import type {
  HostTrayBalloonCapability,
  HostTrayBalloonEventsCapability,
  HostTrayBoundsCapability,
  HostTrayDoubleClickPolicyCapability,
  HostTrayDropEventsCapability,
  HostTrayImageCapability,
  HostTrayInteractionEventsCapability,
  HostTrayLifecycleCapability,
  HostTrayMenuCapability,
  HostTrayMenuSelectionEventsCapability,
  HostTrayPopupMenuCapability,
  HostTrayPressedImageCapability,
  HostTrayTemplateImageCapability,
  HostTrayTitleCapability,
  HostTrayTooltipCapability,
} from './Tray';
import type { HostUpdaterCommandCapability } from './Updater';
import type { HostVideoCapability } from './VideoCapabilityBackend';
import type { HostVideoCaptureDialogCapability } from './VideoCaptureDialogBackend';
import type { HostWgpuCapability } from './WgpuHost';

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
  readonly window: HostWindowCapability;
}

export interface HostAccessibilityCapabilities {
  readonly provider?: HostAccessibilityCapability;
}

export interface HostAppCapabilities {
  readonly activate?: HostAppActivateCapability;
  readonly activationPolicy?: HostAppActivationPolicyCapability;
  readonly allWindowsClosed?: HostAppAllWindowsClosedCapability;
  readonly badge?: HostAppBadgeCapability;
  readonly dock?: HostAppDockCapability;
  readonly exit?: HostApplicationExitCapability;
  readonly focus?: HostAppFocusCapability;
  readonly hide?: HostAppHideCapability;
  readonly locale?: HostAppLocaleCapability;
  readonly loginItem?: HostAppLoginItemCapability;
  readonly loop?: HostLoopCapability;
  readonly name?: HostAppNameCapability;
  readonly nameWrite?: HostAppNameWriteCapability;
  readonly openFile?: HostAppOpenFileCapability;
  readonly path?: HostAppPathCapability;
  readonly hiddenQuery?: HostAppVisibilityQueryCapability;
  readonly quit?: HostAppQuitCapability;
  readonly quitRequest?: HostAppQuitRequestCapability;
  readonly ready?: HostAppReadyCapability;
  readonly recentDocuments?: HostAppRecentDocumentsCapability;
  readonly relaunch?: HostAppRelaunchCapability;
  readonly secondInstance?: HostAppSecondInstanceCapability;
  readonly show?: HostAppShowCapability;
  readonly singleInstance?: HostAppSingleInstanceCapability;
  readonly userModelId?: HostAppUserModelIdCapability;
  readonly version?: HostAppVersionCapability;
  readonly visibility?: HostApplicationVisibilityCapability;
}

export interface HostProtocolCapabilities {
  readonly default?: HostProtocolDefaultCapability;
  readonly launch?: HostProtocolLaunchCapability;
  readonly open?: HostProtocolOpenCapability;
  readonly registration?: HostProtocolRegistrationCapability;
  readonly registrationQuery?: HostProtocolRegistrationQueryCapability;
  readonly unregistration?: HostProtocolUnregistrationCapability;
}

export interface HostClipboardCapabilities {
  readonly bookmark?: HostClipboardBookmarkCapability;
  readonly change?: HostClipboardChangeCapability;
  readonly formats?: HostClipboardFormatsCapability;
  readonly image?: HostClipboardImageCapability;
  readonly text?: HostClipboardTextCapability;
}
export interface HostConnectivityCapabilities {
  readonly change?: HostConnectivityChangeCapability;
  readonly reachability?: HostConnectivityReachabilityCapability;
  readonly status?: HostConnectivityStatusCapability;
}

export interface HostDialogCapabilities {
  readonly directoryOpen?: HostDirectoryOpenDialogCapability;
  readonly fileOpen?: HostFileOpenDialogCapability;
  readonly fileSave?: HostFileSaveDialogCapability;
  readonly imageOpen?: HostImageOpenDialogCapability;
  readonly message?: HostMessageDialogCapability;
  readonly photoCapture?: HostPhotoCaptureDialogCapability;
  readonly prompt?: HostPromptDialogCapability;
  readonly videoCapture?: HostVideoCaptureDialogCapability;
}

export interface HostGraphicsCapabilities {
  readonly bitmapEncode?: HostBitmapEncodeCapability;
  readonly bitmapReadback?: HostBitmapReadbackCapability;
  readonly image?: HostImageCapability;
  readonly renderContext?: HostRenderContextCapability;
  readonly renderSurface?: HostRenderSurfaceCapability;
  readonly wgpuHost?: HostWgpuCapability;
}

export interface HostInputCapabilities {
  readonly dropFile?: HostInputDropFileCapability;
  readonly focus?: HostInputFocusCapability;
  readonly haptics?: HostHapticsCapability;
  readonly ingress?: HostInputIngressCapability;
  readonly pointerLock?: HostInputPointerLockCapability;
  readonly softKeyboardAccessoryBar?: HostSoftKeyboardAccessoryBarCapability;
  readonly softKeyboardChange?: HostSoftKeyboardChangeCapability;
  readonly softKeyboardInfo?: HostSoftKeyboardInfoCapability;
  readonly softKeyboardResizeModeWrite?: HostSoftKeyboardResizeModeWriteCapability;
  readonly softKeyboardScrollAssist?: HostSoftKeyboardScrollAssistCapability;
  readonly softKeyboardStyle?: HostSoftKeyboardStyleCapability;
  readonly softKeyboardVisibility?: HostSoftKeyboardVisibilityCapability;
  readonly target?: HostInputTargetCapability;
}

export interface HostIpcCapabilities {
  readonly handle?: HostIpcHandleCapability;
  readonly invoke?: HostIpcInvokeCapability;
  readonly message?: HostIpcMessageCapability;
  readonly send?: HostIpcSendCapability;
  readonly targetedSend?: HostIpcTargetedSendCapability;
}

export interface HostMediaCapabilities {
  readonly audioCodec?: HostAudioCapability;
  readonly audioDevice?: HostAudioDeviceCapability;
  readonly audioMixer?: HostAudioMixerCapability;
  readonly session?: HostMediaSessionCapability;
  readonly sessionAction?: HostMediaSessionActionCapability;
  readonly video?: HostVideoCapability;
}

// Menu is a top-level group rather than a ui slot: its three capabilities have different provider
// coverage AND incompatible shapes, so one combined provider could not represent them honestly. The group is
// non-optional like every other; the slots inside it are optional, and an omitted slot means the host
// genuinely lacks that capability — never a stub that answers false.
export interface HostMenuCapabilities {
  readonly application?: HostMenuApplicationCapability;
  readonly highlight?: HostMenuHighlightCapability;
  readonly popup?: HostMenuPopupCapability;
  readonly select?: HostMenuSelectCapability;
}

export interface HostMidiCapabilities {
  readonly access?: HostMidiAccessCapability;
  readonly permission?: HostMidiPermissionCapability;
}

export interface HostNetCapabilities {
  readonly http?: HostNetCapability;
  readonly socket?: HostSocketCapability;
}

export interface HostNotificationCapabilities {
  readonly action?: HostNotificationActionCapability;
  readonly activeList?: HostNotificationActiveListCapability;
  readonly click?: HostNotificationClickCapability;
  readonly close?: HostNotificationCloseCapability;
  readonly delivery?: HostNotificationDeliveryCapability;
  readonly dismiss?: HostNotificationDismissCapability;
  readonly lifecycle?: HostNotificationLifecycleCapability;
  readonly permission?: HostNotificationPermissionCapability;
  readonly received?: HostNotificationReceivedCapability;
  readonly reply?: HostNotificationReplyCapability;
  readonly scheduling?: HostNotificationSchedulingCapability;
}

// Share is top-level because content and Flight data-URL files have different provider coverage.
// Omission is capability absence; providers never install a stub that merely answers false.
export interface HostShareCapabilities {
  readonly content?: HostShareContentCapability;
  readonly files?: HostShareFilesCapability;
}

// Power is a top-level group: its capabilities vary independently by host (web has keep-awake and
// suspend/resume but no idle, session lock or battery health; electron has all of them), so one
// combined power provider could not represent any host honestly.
export interface HostPowerCapabilities {
  readonly batteryHealth?: HostPowerBatteryHealthCapability;
  readonly change?: HostPowerChangeCapability;
  readonly idle?: HostPowerIdleCapability;
  readonly keepAwake?: HostPowerKeepAwakeCapability;
  readonly sessionLock?: HostPowerSessionLockCapability;
  readonly status?: HostPowerStatusCapability;
  readonly suspension?: HostPowerSuspensionCapability;
  readonly thermal?: HostPowerThermalCapability;
}

export interface HostScreenCapabilities {
  readonly change?: HostScreenChangeCapability;
  readonly details?: HostScreenDetailsCapability;
  readonly permissionChange?: HostScreenPermissionChangeCapability;
  readonly query?: HostScreenQueryCapability;
}

export type WebScreenCapabilities = Entity & Required<HostScreenCapabilities>;

// Shell is top-level because its seven command capabilities have distinct provider coverage. Every
// Host names the group; omitted slots mean genuine absence, never a false-returning stub.
export interface HostShellCapabilities {
  readonly beep?: HostShellBeepCapability;
  readonly external?: HostShellExternalCapability;
  readonly pathOpen?: HostShellPathOpenCapability;
  readonly pathReveal?: HostShellPathRevealCapability;
  readonly process?: HostShellProcessCapability;
  readonly shortcutLink?: HostShellShortcutLinkCapability;
  readonly trash?: HostShellTrashCapability;
}

// Shortcut stays top-level because trigger is an event subscription and query is a command/result;
// both happen to have E/T coverage, but combining their incompatible shapes would hide that split.
export interface HostShortcutCapabilities {
  readonly query?: HostShortcutQueryCapability;
  readonly trigger?: HostShortcutTriggerCapability;
}

export interface HostStorageCapabilities {
  readonly change?: HostStorageChangeCapability;
  readonly fileSystem?: HostFileSystemCapability;
  readonly local?: HostStorageCapability;
  readonly persistenceQuery?: HostStoragePersistenceQueryCapability;
  readonly persistenceRequest?: HostStoragePersistenceRequestCapability;
}

export interface HostSystemCapabilities {
  readonly device?: HostDeviceCapability;
  readonly geolocation?: HostGeolocationCapability;
  readonly lifecycle?: HostLifecycleCapability;
  readonly permissions?: HostPermissionsCapability;
  readonly platform?: HostPlatformCapability;
  readonly sensors?: HostSensorsCapability;
}

export interface HostTextCapabilities {
  readonly fontLoading?: HostFontLoadingCapability;
  readonly glyphRasterizer?: HostGlyphRasterizerCapability;
  readonly segmenter?: HostTextSegmenterCapability;
  readonly shaper?: HostTextShaperCapability;
}

// Tray is top-level because command, query, and event coverage varies independently by native OS
// profile. The required group is stable; omitted slots mean genuine absence.
export interface HostTrayCapabilities {
  readonly balloon?: HostTrayBalloonCapability;
  readonly balloonEvents?: HostTrayBalloonEventsCapability;
  readonly bounds?: HostTrayBoundsCapability;
  readonly doubleClickPolicy?: HostTrayDoubleClickPolicyCapability;
  readonly dropEvents?: HostTrayDropEventsCapability;
  readonly image?: HostTrayImageCapability;
  readonly interactionEvents?: HostTrayInteractionEventsCapability;
  readonly lifecycle?: HostTrayLifecycleCapability;
  readonly menu?: HostTrayMenuCapability;
  readonly menuSelectionEvents?: HostTrayMenuSelectionEventsCapability;
  readonly popupMenu?: HostTrayPopupMenuCapability;
  readonly pressedImage?: HostTrayPressedImageCapability;
  readonly templateImage?: HostTrayTemplateImageCapability;
  readonly title?: HostTrayTitleCapability;
  readonly tooltip?: HostTrayTooltipCapability;
}

export interface HostUiCapabilities {
  readonly fullscreen?: HostFullscreenCapability;
  readonly statusBarChange?: HostStatusBarChangeCapability;
  readonly statusBarColor?: HostStatusBarColorCapability;
  readonly statusBarInfo?: HostStatusBarInfoCapability;
  readonly statusBarOverlays?: HostStatusBarOverlaysCapability;
  readonly statusBarStyle?: HostStatusBarStyleCapability;
  readonly statusBarVisibility?: HostStatusBarVisibilityCapability;
}

export interface HostUpdaterCapabilities {
  readonly command?: HostUpdaterCommandCapability;
}
