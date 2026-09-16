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
import type {
  HostWindowAttachCapability,
  HostWindowAttentionCapability,
  HostWindowBoundsCapability,
  HostWindowChromeCapability,
  HostWindowConfigCapability,
  HostWindowEventsCapability,
  HostWindowFocusCapability,
  HostWindowFullscreenCapability,
  HostWindowLifecycleCapability,
  HostWindowParentCapability,
  HostWindowSizeConstraintsCapability,
  HostWindowStateCapability,
  HostWindowTitleCapability,
  HostWindowVisibilityCapability,
} from './ApplicationWindow';
import type {
  HostGlCapability,
  HostInputDropFileCapability,
  HostInputFocusCapability,
  HostInputPointerLockCapability,
  HostSurfaceCapability,
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
import type { HostElementFullscreenCapability, HostFullscreenCapability } from './FullscreenBackend';
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
  HostPreferencesCapability,
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
  readonly audio: HostAudioCapabilities;
  readonly bitmap: HostBitmapCapabilities;
  readonly clipboard: HostClipboardCapabilities;
  readonly connectivity: HostConnectivityCapabilities;
  readonly device: HostDeviceCapabilities;
  readonly dialog: HostDialogCapabilities;
  readonly fileSystem: HostFileSystemCapabilities;
  readonly fullscreen: HostFullscreenCapabilities;
  readonly geolocation: HostGeolocationCapabilities;
  readonly gl: HostGlCapabilities;
  readonly haptics: HostHapticsCapabilities;
  readonly image: HostImageCapabilities;
  readonly input: HostInputCapabilities;
  readonly ipc: HostIpcCapabilities;
  readonly lifecycle: HostLifecycleCapabilities;
  readonly mediaSession: HostMediaSessionCapabilities;
  readonly menu: HostMenuCapabilities;
  readonly midi: HostMidiCapabilities;
  readonly net: HostNetCapabilities;
  readonly notification: HostNotificationCapabilities;
  readonly permissions: HostPermissionsCapabilities;
  readonly platform: HostPlatformCapabilities;
  readonly power: HostPowerCapabilities;
  readonly preferences: HostPreferencesCapabilities;
  readonly protocol: HostProtocolCapabilities;
  readonly screen: HostScreenCapabilities;
  readonly sensors: HostSensorsCapabilities;
  readonly share: HostShareCapabilities;
  readonly shell: HostShellCapabilities;
  readonly shortcut: HostShortcutCapabilities;
  readonly softKeyboard: HostSoftKeyboardCapabilities;
  readonly statusBar: HostStatusBarCapabilities;
  readonly storagePersistence: HostStoragePersistenceCapabilities;
  readonly surface: HostSurfaceCapabilities;
  readonly text: HostTextCapabilities;
  readonly tray: HostTrayCapabilities;
  readonly updater: HostUpdaterCapabilities;
  readonly video: HostVideoCapabilities;
  readonly wgpu: HostWgpuCapabilities;
  readonly window: HostWindowCapabilities;
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

export interface HostAudioCapabilities {
  readonly codec?: HostAudioCapability;
  readonly device?: HostAudioDeviceCapability;
  readonly mixer?: HostAudioMixerCapability;
}

export interface HostBitmapCapabilities {
  readonly encode?: HostBitmapEncodeCapability;
  readonly readback?: HostBitmapReadbackCapability;
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

export interface HostDeviceCapabilities {
  readonly info?: HostDeviceCapability;
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

export interface HostFileSystemCapabilities {
  readonly provider?: HostFileSystemCapability;
}

export interface HostFullscreenCapabilities {
  readonly element?: HostElementFullscreenCapability;
  readonly provider?: HostFullscreenCapability;
}

export interface HostGeolocationCapabilities {
  readonly provider?: HostGeolocationCapability;
}

export interface HostGlCapabilities {
  readonly context?: HostGlCapability;
}

export interface HostHapticsCapabilities {
  readonly provider?: HostHapticsCapability;
}

export interface HostImageCapabilities {
  readonly decode?: HostImageCapability;
}

export interface HostInputCapabilities {
  readonly dropFile?: HostInputDropFileCapability;
  readonly focus?: HostInputFocusCapability;
  readonly ingress?: HostInputIngressCapability;
  readonly pointerLock?: HostInputPointerLockCapability;
  readonly target?: HostInputTargetCapability;
}

export interface HostIpcCapabilities {
  readonly handle?: HostIpcHandleCapability;
  readonly invoke?: HostIpcInvokeCapability;
  readonly message?: HostIpcMessageCapability;
  readonly send?: HostIpcSendCapability;
  readonly targetedSend?: HostIpcTargetedSendCapability;
}

export interface HostLifecycleCapabilities {
  readonly provider?: HostLifecycleCapability;
}

export interface HostMediaSessionCapabilities {
  readonly action?: HostMediaSessionActionCapability;
  readonly session?: HostMediaSessionCapability;
}

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

export interface HostPermissionsCapabilities {
  readonly provider?: HostPermissionsCapability;
}

export interface HostPlatformCapabilities {
  readonly info?: HostPlatformCapability;
}

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

export interface HostPreferencesCapabilities {
  readonly change?: HostStorageChangeCapability;
  readonly local?: HostPreferencesCapability;
}

export interface HostProtocolCapabilities {
  readonly default?: HostProtocolDefaultCapability;
  readonly launch?: HostProtocolLaunchCapability;
  readonly open?: HostProtocolOpenCapability;
  readonly registration?: HostProtocolRegistrationCapability;
  readonly registrationQuery?: HostProtocolRegistrationQueryCapability;
  readonly unregistration?: HostProtocolUnregistrationCapability;
}

export interface HostScreenCapabilities {
  readonly change?: HostScreenChangeCapability;
  readonly details?: HostScreenDetailsCapability;
  readonly permissionChange?: HostScreenPermissionChangeCapability;
  readonly query?: HostScreenQueryCapability;
}

export type WebScreenCapabilities = Entity & Required<HostScreenCapabilities>;

export interface HostSensorsCapabilities {
  readonly provider?: HostSensorsCapability;
}

export interface HostShareCapabilities {
  readonly content?: HostShareContentCapability;
  readonly files?: HostShareFilesCapability;
}

export interface HostShellCapabilities {
  readonly beep?: HostShellBeepCapability;
  readonly external?: HostShellExternalCapability;
  readonly pathOpen?: HostShellPathOpenCapability;
  readonly pathReveal?: HostShellPathRevealCapability;
  readonly process?: HostShellProcessCapability;
  readonly shortcutLink?: HostShellShortcutLinkCapability;
  readonly trash?: HostShellTrashCapability;
}

export interface HostShortcutCapabilities {
  readonly query?: HostShortcutQueryCapability;
  readonly trigger?: HostShortcutTriggerCapability;
}

export interface HostSoftKeyboardCapabilities {
  readonly accessoryBar?: HostSoftKeyboardAccessoryBarCapability;
  readonly change?: HostSoftKeyboardChangeCapability;
  readonly info?: HostSoftKeyboardInfoCapability;
  readonly resizeModeWrite?: HostSoftKeyboardResizeModeWriteCapability;
  readonly scrollAssist?: HostSoftKeyboardScrollAssistCapability;
  readonly style?: HostSoftKeyboardStyleCapability;
  readonly visibility?: HostSoftKeyboardVisibilityCapability;
}

export interface HostStatusBarCapabilities {
  readonly change?: HostStatusBarChangeCapability;
  readonly color?: HostStatusBarColorCapability;
  readonly info?: HostStatusBarInfoCapability;
  readonly overlays?: HostStatusBarOverlaysCapability;
  readonly style?: HostStatusBarStyleCapability;
  readonly visibility?: HostStatusBarVisibilityCapability;
}

export interface HostStoragePersistenceCapabilities {
  readonly query?: HostStoragePersistenceQueryCapability;
  readonly request?: HostStoragePersistenceRequestCapability;
}

export interface HostSurfaceCapabilities {
  readonly resize?: HostSurfaceCapability;
}

export interface HostTextCapabilities {
  readonly fontLoading?: HostFontLoadingCapability;
  readonly glyphRasterizer?: HostGlyphRasterizerCapability;
  readonly segmenter?: HostTextSegmenterCapability;
  readonly shaper?: HostTextShaperCapability;
}

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

export interface HostUpdaterCapabilities {
  readonly command?: HostUpdaterCommandCapability;
}

export interface HostVideoCapabilities {
  readonly provider?: HostVideoCapability;
}

export interface HostWgpuCapabilities {
  readonly provider?: HostWgpuCapability;
}

export interface HostWindowCapabilities {
  readonly attach?: HostWindowAttachCapability;
  readonly attention?: HostWindowAttentionCapability;
  readonly bounds?: HostWindowBoundsCapability;
  readonly chrome?: HostWindowChromeCapability;
  readonly config?: HostWindowConfigCapability;
  readonly events?: HostWindowEventsCapability;
  readonly focus?: HostWindowFocusCapability;
  readonly fullscreen?: HostWindowFullscreenCapability;
  readonly lifecycle?: HostWindowLifecycleCapability;
  readonly parent?: HostWindowParentCapability;
  readonly sizeConstraints?: HostWindowSizeConstraintsCapability;
  readonly state?: HostWindowStateCapability;
  readonly title?: HostWindowTitleCapability;
  readonly visibility?: HostWindowVisibilityCapability;
}
