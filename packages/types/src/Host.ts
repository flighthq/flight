import type { HostAccessibilityCapability } from './Accessibility.ts';
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
} from './App.ts';
import type {
  HostWindowAppearanceCapability,
  HostWindowAttachCapability,
  HostWindowAttentionCapability,
  HostWindowContentProtectionCapability,
  HostWindowFocusCapability,
  HostWindowFullscreenCapability,
  HostWindowGeometryCapability,
  HostWindowHierarchyCapability,
  HostWindowLifecycleCapability,
  HostWindowProgressCapability,
  HostWindowShadowCapability,
  HostWindowShellCapability,
  HostWindowSizeConstraintsCapability,
  HostWindowStateCapability,
  HostWindowVisibilityCapability,
  HostWindowZOrderCapability,
} from './AppWindow.ts';
import type {
  HostClipboardBookmarkCapability,
  HostClipboardChangeCapability,
  HostClipboardFormatsCapability,
  HostClipboardImageCapability,
  HostClipboardTextCapability,
} from './Clipboard.ts';
import type {
  HostCompressDeflateCapability,
  HostCompressLzmaCapability,
  HostDecompressBrotliCapability,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
} from './Compression.ts';
import type {
  HostConnectivityChangeCapability,
  HostConnectivityReachabilityCapability,
  HostConnectivityStatusCapability,
} from './Connectivity.ts';
import type { HostDeviceCapability } from './Device.ts';
import type { Entity } from './Entity.ts';
import type { HostFileSystemCapability } from './FileSystem.ts';
import type { HostGeolocationCapability } from './Geolocation.ts';
import type { HostGlyphRasterizerCapability } from './GlyphSource.ts';
import type { HostHapticsCapability } from './Haptics.ts';
import type { HostAppExitCapability } from './HostAppExit.ts';
import type { HostAppLoopCapability } from './HostAppLoop.ts';
import type { HostAudioCodecCapability } from './HostAudioCodec.ts';
import type { HostAudioDecodeCapabilities } from './HostAudioDecode.ts';
import type { HostAudioDeviceCapability } from './HostAudioDevice.ts';
import type { HostAudioMixerCapability } from './HostAudioMixer.ts';
import type { HostBitmapEncodeCapability } from './HostBitmapEncode.ts';
import type { HostBitmapReadbackCapability } from './HostBitmapReadback.ts';
import type { HostCanvasCapability } from './HostCanvas.ts';
import type {
  HostDirectoryOpenDialogCapability,
  HostFileOpenDialogCapability,
  HostFileSaveDialogCapability,
} from './HostFileDialog.ts';
import type { HostFontLoadingCapability } from './HostFontLoading.ts';
import type { HostElementFullscreenCapability } from './HostFullscreen.ts';
import type { HostGlCapability } from './HostGl.ts';
import type { HostImageDecodeCapabilities } from './HostImageDecode.ts';
import type { HostImageEncodeCapabilities } from './HostImageEncode.ts';
import type { HostImageOpenDialogCapability } from './HostImageOpenDialog.ts';
import type {
  HostInputDropFileCapability,
  HostInputFocusCapability,
  HostInputPointerLockCapability,
} from './HostInput.ts';
import type { HostInputIngressCapability } from './HostInputIngress.ts';
import type { HostInputTargetCapability } from './HostInputTarget.ts';
import type { HostMessageDialogCapability } from './HostMessageDialog.ts';
import type { HostPhotoCaptureDialogCapability } from './HostPhotoCaptureDialog.ts';
import type { HostPromptDialogCapability } from './HostPromptDialog.ts';
import type { HostSurfaceDisplayCapability, HostSurfaceResizeCapability } from './HostSurface.ts';
import type { HostVideoCapability } from './HostVideo.ts';
import type { HostVideoCaptureDialogCapability } from './HostVideoCaptureDialog.ts';
import type { HostImageCapability } from './ImageResource.ts';
import type {
  HostIpcHandleCapability,
  HostIpcInvokeCapability,
  HostIpcMessageCapability,
  HostIpcSendCapability,
  HostIpcTargetedSendCapability,
} from './Ipc.ts';
import type {
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardChangeCapability,
  HostSoftKeyboardInfoCapability,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardScrollAssistCapability,
  HostSoftKeyboardStyleCapability,
  HostSoftKeyboardVisibilityCapability,
} from './Keyboard.ts';
import type { HostLifecycleCapability } from './Lifecycle.ts';
import type { HostMediaSessionActionCapability, HostMediaSessionCapability } from './MediaSession.ts';
import type {
  HostAppMenuCapability,
  HostMenuHighlightCapability,
  HostMenuPopupCapability,
  HostMenuSelectCapability,
} from './Menu.ts';
import type { HostMidiAccessCapability, HostMidiPermissionCapability } from './Midi.ts';
import type { HostNetCapability } from './Net.ts';
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
} from './Notification.ts';
import type { HostPermissionsCapability } from './Permission.ts';
import type { HostPlatformCapability } from './Platform.ts';
import type {
  HostPowerBatteryHealthCapability,
  HostPowerChangeCapability,
  HostPowerIdleCapability,
  HostPowerKeepAwakeCapability,
  HostPowerSessionLockCapability,
  HostPowerStatusCapability,
  HostPowerSuspensionCapability,
  HostPowerThermalCapability,
} from './Power.ts';
import type {
  HostProtocolDefaultCapability,
  HostProtocolLaunchCapability,
  HostProtocolOpenCapability,
  HostProtocolRegistrationCapability,
  HostProtocolRegistrationQueryCapability,
  HostProtocolUnregistrationCapability,
} from './Protocol.ts';
import type {
  HostScreenChangeCapability,
  HostScreenDetailsCapability,
  HostScreenPermissionChangeCapability,
  HostScreenQueryCapability,
} from './Screen.ts';
import type { HostSensorsCapability } from './Sensors.ts';
import type { HostShareContentCapability, HostShareFilesCapability } from './Share.ts';
import type {
  HostShellBeepCapability,
  HostShellExternalCapability,
  HostShellPathOpenCapability,
  HostShellPathRevealCapability,
  HostShellProcessCapability,
  HostShellShortcutLinkCapability,
  HostShellTrashCapability,
} from './Shell.ts';
import type { HostShortcutQueryCapability, HostShortcutTriggerCapability } from './Shortcut.ts';
import type { HostSocketCapability } from './Socket.ts';
import type {
  HostStatusBarChangeCapability,
  HostStatusBarColorCapability,
  HostStatusBarInfoCapability,
  HostStatusBarOverlaysCapability,
  HostStatusBarStyleCapability,
  HostStatusBarVisibilityCapability,
} from './StatusBar.ts';
import type {
  HostPreferencesCapability,
  HostPreferencesChangeCapability,
  HostPreferencesPersistenceQueryCapability,
  HostPreferencesPersistenceRequestCapability,
} from './Storage.ts';
import type { HostTextSegmenterCapability } from './TextSegment.ts';
import type { HostTextShaperCapability } from './TextShaper.ts';
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
} from './Tray.ts';
import type { HostUpdaterCommandCapability } from './Updater.ts';
import type { HostWgpuCapability } from './WgpuHost.ts';

export interface Host extends Entity {
  readonly accessibility: HostAccessibilityCapabilities;
  readonly app: HostAppCapabilities;
  readonly audio: HostAudioCapabilities;
  readonly audioDecode: HostAudioDecodeCapabilities;
  readonly bitmap: HostBitmapCapabilities;
  readonly canvas: HostCanvasCapabilities;
  readonly clipboard: HostClipboardCapabilities;
  readonly compress: HostCompressCapabilities;
  readonly connectivity: HostConnectivityCapabilities;
  readonly decompress: HostDecompressCapabilities;
  readonly device: HostDeviceCapabilities;
  readonly dialog: HostDialogCapabilities;
  readonly fileSystem: HostFileSystemCapabilities;
  readonly font: HostFontCapabilities;
  readonly fullscreen: HostFullscreenCapabilities;
  readonly geolocation: HostGeolocationCapabilities;
  readonly gl: HostGlCapabilities;
  readonly glyph: HostGlyphCapabilities;
  readonly haptics: HostHapticsCapabilities;
  readonly image: HostImageCapabilities;
  readonly imageDecode: HostImageDecodeCapabilities;
  readonly imageEncode: HostImageEncodeCapabilities;
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
  readonly socket: HostSocketCapabilities;
  readonly softKeyboard: HostSoftKeyboardCapabilities;
  readonly statusBar: HostStatusBarCapabilities;
  readonly surface: HostSurfaceCapabilities;
  readonly textSegment: HostTextSegmentCapabilities;
  readonly textShaper: HostTextShaperCapabilities;
  readonly tray: HostTrayCapabilities;
  readonly updater: HostUpdaterCapabilities;
  readonly video: HostVideoCapabilities;
  readonly wgpu: HostWgpuCapabilities;
  readonly window: HostWindowCapabilities;
}

export interface HostAccessibilityCapabilities {
  readonly tree?: HostAccessibilityCapability;
}

export interface HostAppCapabilities {
  readonly activate?: HostAppActivateCapability;
  readonly activationPolicy?: HostAppActivationPolicyCapability;
  readonly allWindowsClosed?: HostAppAllWindowsClosedCapability;
  readonly badge?: HostAppBadgeCapability;
  readonly dock?: HostAppDockCapability;
  readonly exit?: HostAppExitCapability;
  readonly focus?: HostAppFocusCapability;
  readonly hide?: HostAppHideCapability;
  readonly locale?: HostAppLocaleCapability;
  readonly loginItem?: HostAppLoginItemCapability;
  readonly loop?: HostAppLoopCapability;
  readonly name?: HostAppNameCapability;
  readonly nameWrite?: HostAppNameWriteCapability;
  readonly openFile?: HostAppOpenFileCapability;
  readonly path?: HostAppPathCapability;
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
}

export interface HostAudioCapabilities {
  readonly codec?: HostAudioCodecCapability;
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

export interface HostCompressCapabilities {
  readonly deflate?: HostCompressDeflateCapability;
  readonly lzma?: HostCompressLzmaCapability;
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
  readonly access?: HostFileSystemCapability;
}

export interface HostFontCapabilities {
  readonly loader?: HostFontLoadingCapability;
}

export interface HostFullscreenCapabilities {
  readonly element?: HostElementFullscreenCapability;
}

export interface HostGeolocationCapabilities {
  readonly position?: HostGeolocationCapability;
}

export interface HostCanvasCapabilities {
  readonly context?: HostCanvasCapability;
}

export interface HostGlCapabilities {
  readonly context?: HostGlCapability;
}

export interface HostGlyphCapabilities {
  readonly rasterizer?: HostGlyphRasterizerCapability;
}

export interface HostHapticsCapabilities {
  readonly engine?: HostHapticsCapability;
}

export interface HostImageCapabilities {
  readonly loader?: HostImageCapability;
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
  readonly state?: HostLifecycleCapability;
}

export interface HostMediaSessionCapabilities {
  readonly action?: HostMediaSessionActionCapability;
  readonly control?: HostMediaSessionCapability;
}

export interface HostMenuCapabilities {
  readonly app?: HostAppMenuCapability;
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
  readonly query?: HostPermissionsCapability;
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
  readonly change?: HostPreferencesChangeCapability;
  readonly local?: HostPreferencesCapability;
  readonly persistenceQuery?: HostPreferencesPersistenceQueryCapability;
  readonly persistenceRequest?: HostPreferencesPersistenceRequestCapability;
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

export type WebScreenCapabilities = Required<HostScreenCapabilities>;

export interface HostSensorsCapabilities {
  readonly query?: HostSensorsCapability;
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

export interface HostSocketCapabilities {
  readonly connection?: HostSocketCapability;
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

export interface HostSurfaceCapabilities {
  readonly display?: HostSurfaceDisplayCapability;
  readonly resize?: HostSurfaceResizeCapability;
}

export interface HostTextSegmentCapabilities {
  readonly segmenter?: HostTextSegmenterCapability;
}

// Decompression the host supplies, one slot per algorithm. Plain data with named slots, like every
// other Host group: no registry, no ambient lookup, and no import-order dependence — a parser that
// needs to inflate takes the slot (or this group, when the FILE's own bytes select the algorithm) as
// an explicit argument, so what it needs is visible in its signature.
export interface HostDecompressCapabilities {
  readonly brotli?: HostDecompressBrotliCapability;
  readonly deflate?: HostDecompressDeflateCapability;
  readonly lzma?: HostDecompressLzmaCapability;
}

export interface HostTextShaperCapabilities {
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
  readonly playback?: HostVideoCapability;
}

export interface HostWgpuCapabilities {
  readonly context?: HostWgpuCapability;
}

export interface HostWindowCapabilities {
  readonly appearance?: HostWindowAppearanceCapability;
  readonly attach?: HostWindowAttachCapability;
  readonly attention?: HostWindowAttentionCapability;
  readonly contentProtection?: HostWindowContentProtectionCapability;
  readonly focus?: HostWindowFocusCapability;
  readonly fullscreen?: HostWindowFullscreenCapability;
  readonly geometry?: HostWindowGeometryCapability;
  readonly hierarchy?: HostWindowHierarchyCapability;
  readonly lifecycle?: HostWindowLifecycleCapability;
  readonly progress?: HostWindowProgressCapability;
  readonly shadow?: HostWindowShadowCapability;
  readonly shell?: HostWindowShellCapability;
  readonly sizeConstraints?: HostWindowSizeConstraintsCapability;
  readonly state?: HostWindowStateCapability;
  readonly visibility?: HostWindowVisibilityCapability;
  readonly zOrder?: HostWindowZOrderCapability;
}
