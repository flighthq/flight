import type { AccessibilityBackend } from './Accessibility';
import type {
  AppActivateBackend,
  AppActivationPolicyBackend,
  AppAllWindowsClosedBackend,
  AppBadgeBackend,
  AppDockBackend,
  AppFocusBackend,
  AppHideBackend,
  AppLocaleBackend,
  AppLoginItemBackend,
  AppNameBackend,
  AppNameWriteBackend,
  AppOpenFileBackend,
  AppPathBackend,
  AppQuitBackend,
  AppQuitRequestBackend,
  AppReadyBackend,
  AppRecentDocumentsBackend,
  AppRelaunchBackend,
  AppSecondInstanceBackend,
  AppSingleInstanceBackend,
  AppUserModelIdBackend,
  AppVersionBackend,
  AppShowBackend,
  AppVisibilityQueryBackend,
} from './App';
import type { ApplicationExitBackend } from './ApplicationExitBackend';
import type { ApplicationVisibilityBackend } from './ApplicationVisibilityBackend';
import type { WindowBackend } from './ApplicationWindow';
import type {
  InputDropFileBackend,
  InputFocusBackend,
  InputPointerLockBackend,
  RenderContextBackend,
  RenderSurfaceBackend,
} from './ApplicationWindowTargetBackend';
import type { AudioBackend } from './AudioBackend';
import type { AudioDeviceBackend } from './AudioDeviceBackend';
import type { BidiClassBackend } from './Bidi';
import type { BitmapEncodeBackend } from './BitmapEncodeBackend';
import type { BitmapReadbackBackend } from './BitmapReadbackBackend';
import type {
  ClipboardBookmarkBackend,
  ClipboardChangeBackend,
  ClipboardFormatsBackend,
  ClipboardImageBackend,
  ClipboardTextBackend,
} from './Clipboard';
import type {
  ConnectivityChangeBackend,
  ConnectivityReachabilityBackend,
  ConnectivityStatusBackend,
} from './Connectivity';
import type { DeviceBackend } from './Device';
import type { Entity } from './Entity';
import type { DirectoryOpenDialogBackend, FileOpenDialogBackend, FileSaveDialogBackend } from './FileDialogBackend';
import type { FileSystemHostBackend } from './FileSystem';
import type { FontLoadingBackend } from './FontLoadingBackend';
import type { FullscreenBackend } from './FullscreenBackend';
import type { GeolocationBackend } from './Geolocation';
import type { GlyphRasterizerBackend } from './GlyphSource';
import type { HapticsBackend } from './Haptics';
import type { ImageOpenDialogBackend } from './ImageOpenDialogBackend';
import type { ImageBackend } from './ImageResource';
import type { InputIngressBackend } from './InputIngressBackend';
import type { InputTargetBackend } from './InputTargetBackend';
import type {
  IpcHandleBackend,
  IpcInvokeBackend,
  IpcMessageBackend,
  IpcSendBackend,
  IpcTargetedSendBackend,
} from './Ipc';
import type {
  SoftKeyboardAccessoryBarBackend,
  SoftKeyboardChangeBackend,
  SoftKeyboardInfoBackend,
  SoftKeyboardResizeModeWriteBackend,
  SoftKeyboardScrollAssistBackend,
  SoftKeyboardStyleBackend,
  SoftKeyboardVisibilityBackend,
} from './Keyboard';
import type { LifecycleBackend } from './Lifecycle';
import type { LoopBackend } from './LoopBackend';
import type { MediaSessionActionBackend, MediaSessionBackend } from './MediaSession';
import type { MenuApplicationBackend, MenuHighlightBackend, MenuPopupBackend, MenuSelectBackend } from './Menu';
import type { MessageDialogBackend } from './MessageDialogBackend';
import type { MidiAccessBackend, MidiPermissionBackend } from './Midi';
import type { NetBackend } from './Net';
import type {
  NotificationActionBackend,
  NotificationActiveListBackend,
  NotificationClickBackend,
  NotificationCloseBackend,
  NotificationDeliveryBackend,
  NotificationDismissBackend,
  NotificationLifecycleBackend,
  NotificationPermissionBackend,
  NotificationReceivedBackend,
  NotificationReplyBackend,
  NotificationSchedulingBackend,
} from './Notification';
import type { PathBooleanBackend } from './PathBooleanBackend';
import type { PhotoCaptureDialogBackend } from './PhotoCaptureDialogBackend';
import type { PlatformBackend } from './Platform';
import type {
  PowerBatteryHealthBackend,
  PowerChangeBackend,
  PowerIdleBackend,
  PowerKeepAwakeBackend,
  PowerSessionLockBackend,
  PowerStatusBackend,
  PowerSuspensionBackend,
  PowerThermalBackend,
} from './Power';
import type { PromptDialogBackend } from './PromptDialogBackend';
import type {
  ProtocolDefaultBackend,
  ProtocolLaunchBackend,
  ProtocolOpenBackend,
  ProtocolRegistrationBackend,
  ProtocolRegistrationQueryBackend,
  ProtocolUnregistrationBackend,
} from './Protocol';
import type {
  ScreenChangeBackend,
  ScreenDetailsBackend,
  ScreenPermissionChangeBackend,
  ScreenQueryBackend,
} from './Screen';
import type { SensorsBackend } from './Sensors';
import type { ShareContentBackend, ShareFilesBackend } from './Share';
import type {
  ShellBeepBackend,
  ShellExternalBackend,
  ShellPathOpenBackend,
  ShellPathRevealBackend,
  ShellProcessBackend,
  ShellShortcutLinkBackend,
  ShellTrashBackend,
} from './Shell';
import type { ShortcutQueryBackend, ShortcutTriggerBackend } from './Shortcut';
import type { SocketBackend } from './Socket';
import type {
  StatusBarChangeBackend,
  StatusBarColorBackend,
  StatusBarInfoBackend,
  StatusBarOverlaysBackend,
  StatusBarStyleBackend,
  StatusBarVisibilityBackend,
} from './StatusBar';
import type {
  StorageBackend,
  StorageChangeBackend,
  StoragePersistenceQueryBackend,
  StoragePersistenceRequestBackend,
} from './Storage';
import type { TextSegmenterBackend } from './TextSegment';
import type { TextShaperBackend } from './TextShaper';
import type {
  TrayBalloonBackend,
  TrayBalloonEventsBackend,
  TrayBoundsBackend,
  TrayDoubleClickPolicyBackend,
  TrayDropEventsBackend,
  TrayImageBackend,
  TrayInteractionEventsBackend,
  TrayLifecycleBackend,
  TrayMenuBackend,
  TrayMenuSelectionEventsBackend,
  TrayPopupMenuBackend,
  TrayPressedImageBackend,
  TrayTemplateImageBackend,
  TrayTitleBackend,
  TrayTooltipBackend,
} from './Tray';
import type { UpdaterCommandBackend } from './Updater';
import type { VideoCapabilityBackend } from './VideoCapabilityBackend';
import type { VideoCaptureDialogBackend } from './VideoCaptureDialogBackend';
import type { WgpuHostBackend } from './WgpuHost';

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
  readonly window: WindowBackend;
}

export interface HostAccessibilityCapabilities {
  readonly provider?: AccessibilityBackend;
}

export interface HostAppCapabilities {
  readonly activate?: AppActivateBackend;
  readonly activationPolicy?: AppActivationPolicyBackend;
  readonly allWindowsClosed?: AppAllWindowsClosedBackend;
  readonly badge?: AppBadgeBackend;
  readonly dock?: AppDockBackend;
  readonly exit?: ApplicationExitBackend;
  readonly focus?: AppFocusBackend;
  readonly hide?: AppHideBackend;
  readonly locale?: AppLocaleBackend;
  readonly loginItem?: AppLoginItemBackend;
  readonly loop?: LoopBackend;
  readonly name?: AppNameBackend;
  readonly nameWrite?: AppNameWriteBackend;
  readonly openFile?: AppOpenFileBackend;
  readonly path?: AppPathBackend;
  readonly hiddenQuery?: AppVisibilityQueryBackend;
  readonly quit?: AppQuitBackend;
  readonly quitRequest?: AppQuitRequestBackend;
  readonly ready?: AppReadyBackend;
  readonly recentDocuments?: AppRecentDocumentsBackend;
  readonly relaunch?: AppRelaunchBackend;
  readonly secondInstance?: AppSecondInstanceBackend;
  readonly show?: AppShowBackend;
  readonly singleInstance?: AppSingleInstanceBackend;
  readonly userModelId?: AppUserModelIdBackend;
  readonly version?: AppVersionBackend;
  readonly visibility?: ApplicationVisibilityBackend;
}

export interface HostProtocolCapabilities {
  readonly default?: ProtocolDefaultBackend;
  readonly launch?: ProtocolLaunchBackend;
  readonly open?: ProtocolOpenBackend;
  readonly registration?: ProtocolRegistrationBackend;
  readonly registrationQuery?: ProtocolRegistrationQueryBackend;
  readonly unregistration?: ProtocolUnregistrationBackend;
}

export interface HostClipboardCapabilities {
  readonly bookmark?: ClipboardBookmarkBackend;
  readonly change?: ClipboardChangeBackend;
  readonly formats?: ClipboardFormatsBackend;
  readonly image?: ClipboardImageBackend;
  readonly text?: ClipboardTextBackend;
}
export interface HostConnectivityCapabilities {
  readonly change?: ConnectivityChangeBackend;
  readonly reachability?: ConnectivityReachabilityBackend;
  readonly status?: ConnectivityStatusBackend;
}

export interface HostDialogCapabilities {
  readonly directoryOpen?: DirectoryOpenDialogBackend;
  readonly fileOpen?: FileOpenDialogBackend;
  readonly fileSave?: FileSaveDialogBackend;
  readonly imageOpen?: ImageOpenDialogBackend;
  readonly message?: MessageDialogBackend;
  readonly photoCapture?: PhotoCaptureDialogBackend;
  readonly prompt?: PromptDialogBackend;
  readonly videoCapture?: VideoCaptureDialogBackend;
}

export interface HostGraphicsCapabilities {
  readonly bitmapEncode?: BitmapEncodeBackend;
  readonly bitmapReadback?: BitmapReadbackBackend;
  readonly image?: ImageBackend;
  readonly pathBoolean?: PathBooleanBackend;
  readonly renderContext?: RenderContextBackend;
  readonly renderSurface?: RenderSurfaceBackend;
  readonly wgpuHost?: WgpuHostBackend;
}

export interface HostInputCapabilities {
  readonly dropFile?: InputDropFileBackend;
  readonly focus?: InputFocusBackend;
  readonly haptics?: HapticsBackend;
  readonly ingress?: InputIngressBackend;
  readonly pointerLock?: InputPointerLockBackend;
  readonly softKeyboardAccessoryBar?: SoftKeyboardAccessoryBarBackend;
  readonly softKeyboardChange?: SoftKeyboardChangeBackend;
  readonly softKeyboardInfo?: SoftKeyboardInfoBackend;
  readonly softKeyboardResizeModeWrite?: SoftKeyboardResizeModeWriteBackend;
  readonly softKeyboardScrollAssist?: SoftKeyboardScrollAssistBackend;
  readonly softKeyboardStyle?: SoftKeyboardStyleBackend;
  readonly softKeyboardVisibility?: SoftKeyboardVisibilityBackend;
  readonly target?: InputTargetBackend;
}

export interface HostIpcCapabilities {
  readonly handle?: IpcHandleBackend;
  readonly invoke?: IpcInvokeBackend;
  readonly message?: IpcMessageBackend;
  readonly send?: IpcSendBackend;
  readonly targetedSend?: IpcTargetedSendBackend;
}

export interface HostMediaCapabilities {
  readonly audioCodec?: AudioBackend;
  readonly audioDevice?: AudioDeviceBackend;
  readonly session?: MediaSessionBackend;
  readonly sessionAction?: MediaSessionActionBackend;
  readonly video?: VideoCapabilityBackend;
}

// Menu is a top-level group rather than a ui slot: its three capabilities have different provider
// coverage AND incompatible shapes, so one MenuBackend could not represent them honestly. The group is
// non-optional like every other; the slots inside it are optional, and an omitted slot means the host
// genuinely lacks that capability — never a stub that answers false.
export interface HostMenuCapabilities {
  readonly application?: MenuApplicationBackend;
  readonly highlight?: MenuHighlightBackend;
  readonly popup?: MenuPopupBackend;
  readonly select?: MenuSelectBackend;
}

export interface HostMidiCapabilities {
  readonly access?: MidiAccessBackend;
  readonly permission?: MidiPermissionBackend;
}

export interface HostNetCapabilities {
  readonly http?: NetBackend;
  readonly socket?: SocketBackend;
}

export interface HostNotificationCapabilities {
  readonly action?: NotificationActionBackend;
  readonly activeList?: NotificationActiveListBackend;
  readonly click?: NotificationClickBackend;
  readonly close?: NotificationCloseBackend;
  readonly delivery?: NotificationDeliveryBackend;
  readonly dismiss?: NotificationDismissBackend;
  readonly lifecycle?: NotificationLifecycleBackend;
  readonly permission?: NotificationPermissionBackend;
  readonly received?: NotificationReceivedBackend;
  readonly reply?: NotificationReplyBackend;
  readonly scheduling?: NotificationSchedulingBackend;
}

// Share is top-level because content and Flight data-URL files have different provider coverage.
// Omission is capability absence; providers never install a stub that merely answers false.
export interface HostShareCapabilities {
  readonly content?: ShareContentBackend;
  readonly files?: ShareFilesBackend;
}

// Power is a top-level group: its capabilities vary independently by host (web has keep-awake and
// suspend/resume but no idle, session lock or battery health; electron has all of them), so one
// PowerBackend could not represent any host honestly.
export interface HostPowerCapabilities {
  readonly batteryHealth?: PowerBatteryHealthBackend;
  readonly change?: PowerChangeBackend;
  readonly idle?: PowerIdleBackend;
  readonly keepAwake?: PowerKeepAwakeBackend;
  readonly sessionLock?: PowerSessionLockBackend;
  readonly status?: PowerStatusBackend;
  readonly suspension?: PowerSuspensionBackend;
  readonly thermal?: PowerThermalBackend;
}

export interface HostScreenCapabilities {
  readonly change?: ScreenChangeBackend;
  readonly details?: ScreenDetailsBackend;
  readonly permissionChange?: ScreenPermissionChangeBackend;
  readonly query?: ScreenQueryBackend;
}

// Shell is top-level because its seven command capabilities have distinct provider coverage. Every
// Host names the group; omitted slots mean genuine absence, never a false-returning stub.
export interface HostShellCapabilities {
  readonly beep?: ShellBeepBackend;
  readonly external?: ShellExternalBackend;
  readonly pathOpen?: ShellPathOpenBackend;
  readonly pathReveal?: ShellPathRevealBackend;
  readonly process?: ShellProcessBackend;
  readonly shortcutLink?: ShellShortcutLinkBackend;
  readonly trash?: ShellTrashBackend;
}

// Shortcut stays top-level because trigger is an event subscription and query is a command/result;
// both happen to have E/T coverage, but combining their incompatible shapes would hide that split.
export interface HostShortcutCapabilities {
  readonly query?: ShortcutQueryBackend;
  readonly trigger?: ShortcutTriggerBackend;
}

export interface HostStorageCapabilities {
  readonly change?: StorageChangeBackend;
  readonly fileSystem?: FileSystemHostBackend;
  readonly local?: StorageBackend;
  readonly persistenceQuery?: StoragePersistenceQueryBackend;
  readonly persistenceRequest?: StoragePersistenceRequestBackend;
}

export interface HostSystemCapabilities {
  readonly device?: DeviceBackend;
  readonly geolocation?: GeolocationBackend;
  readonly lifecycle?: LifecycleBackend;
  readonly platform?: PlatformBackend;
  readonly sensors?: SensorsBackend;
}

export interface HostTextCapabilities {
  readonly bidiClass?: BidiClassBackend;
  readonly fontLoading?: FontLoadingBackend;
  readonly glyphRasterizer?: GlyphRasterizerBackend;
  readonly segmenter?: TextSegmenterBackend;
  readonly shaper?: TextShaperBackend;
}

// Tray is top-level because command, query, and event coverage varies independently by native OS
// profile. The required group is stable; omitted slots mean genuine absence.
export interface HostTrayCapabilities {
  readonly balloon?: TrayBalloonBackend;
  readonly balloonEvents?: TrayBalloonEventsBackend;
  readonly bounds?: TrayBoundsBackend;
  readonly doubleClickPolicy?: TrayDoubleClickPolicyBackend;
  readonly dropEvents?: TrayDropEventsBackend;
  readonly image?: TrayImageBackend;
  readonly interactionEvents?: TrayInteractionEventsBackend;
  readonly lifecycle?: TrayLifecycleBackend;
  readonly menu?: TrayMenuBackend;
  readonly menuSelectionEvents?: TrayMenuSelectionEventsBackend;
  readonly popupMenu?: TrayPopupMenuBackend;
  readonly pressedImage?: TrayPressedImageBackend;
  readonly templateImage?: TrayTemplateImageBackend;
  readonly title?: TrayTitleBackend;
  readonly tooltip?: TrayTooltipBackend;
}

export interface HostUiCapabilities {
  readonly fullscreen?: FullscreenBackend;
  readonly statusBarChange?: StatusBarChangeBackend;
  readonly statusBarColor?: StatusBarColorBackend;
  readonly statusBarInfo?: StatusBarInfoBackend;
  readonly statusBarOverlays?: StatusBarOverlaysBackend;
  readonly statusBarStyle?: StatusBarStyleBackend;
  readonly statusBarVisibility?: StatusBarVisibilityBackend;
}

export interface HostUpdaterCapabilities {
  readonly command?: UpdaterCommandBackend;
}

export interface HasAccessibilityProvider {
  readonly accessibility: { readonly provider: AccessibilityBackend };
}

export interface HasAppExitSubscription {
  readonly app: { readonly exit: ApplicationExitBackend };
}

export interface HasAppActivate {
  readonly app: { readonly activate: AppActivateBackend };
}

export interface HasAppActivationPolicy {
  readonly app: { readonly activationPolicy: AppActivationPolicyBackend };
}

export interface HasAppAllWindowsClosed {
  readonly app: { readonly allWindowsClosed: AppAllWindowsClosedBackend };
}

export interface HasAppBadge {
  readonly app: { readonly badge: AppBadgeBackend };
}

export interface HasAppDock {
  readonly app: { readonly dock: AppDockBackend };
}

export interface HasAppFocus {
  readonly app: { readonly focus: AppFocusBackend };
}

export interface HasAppLocale {
  readonly app: { readonly locale: AppLocaleBackend };
}

export interface HasAppLoginItem {
  readonly app: { readonly loginItem: AppLoginItemBackend };
}

export interface HasAppName {
  readonly app: { readonly name: AppNameBackend };
}

export interface HasAppNameWrite {
  readonly app: { readonly nameWrite: AppNameWriteBackend };
}

export interface HasAppOpenFile {
  readonly app: { readonly openFile: AppOpenFileBackend };
}

export interface HasAppPath {
  readonly app: { readonly path: AppPathBackend };
}

export interface HasAppHide {
  readonly app: { readonly hide: AppHideBackend };
}

export interface HasAppHiddenQuery {
  readonly app: { readonly hiddenQuery: AppVisibilityQueryBackend };
}

export interface HasAppQuit {
  readonly app: { readonly quit: AppQuitBackend };
}

export interface HasAppQuitRequest {
  readonly app: { readonly quitRequest: AppQuitRequestBackend };
}

export interface HasAppReady {
  readonly app: { readonly ready: AppReadyBackend };
}

export interface HasAppRecentDocuments {
  readonly app: { readonly recentDocuments: AppRecentDocumentsBackend };
}

export interface HasAppRelaunch {
  readonly app: { readonly relaunch: AppRelaunchBackend };
}

export interface HasAppSecondInstance {
  readonly app: { readonly secondInstance: AppSecondInstanceBackend };
}

export interface HasAppShow {
  readonly app: { readonly show: AppShowBackend };
}

export interface HasAppSingleInstance {
  readonly app: { readonly singleInstance: AppSingleInstanceBackend };
}

export interface HasAppUserModelId {
  readonly app: { readonly userModelId: AppUserModelIdBackend };
}

export interface HasAppVersion {
  readonly app: { readonly version: AppVersionBackend };
}

export interface HasProtocolDefault {
  readonly protocol: { readonly default: ProtocolDefaultBackend };
}

export interface HasProtocolLaunch {
  readonly protocol: { readonly launch: ProtocolLaunchBackend };
}

export interface HasProtocolOpen {
  readonly protocol: { readonly open: ProtocolOpenBackend };
}

export interface HasProtocolRegistration {
  readonly protocol: { readonly registration: ProtocolRegistrationBackend };
}

export interface HasProtocolRegistrationQuery {
  readonly protocol: { readonly registrationQuery: ProtocolRegistrationQueryBackend };
}

export interface HasProtocolUnregistration {
  readonly protocol: { readonly unregistration: ProtocolUnregistrationBackend };
}

export interface HasAppLoop {
  readonly app: { readonly loop: LoopBackend };
}

export interface HasUpdaterCommand {
  readonly updater: { readonly command: UpdaterCommandBackend };
}

export interface HasShortcutQuery {
  readonly shortcut: { readonly query: ShortcutQueryBackend };
}

export interface HasShortcutTrigger {
  readonly shortcut: { readonly trigger: ShortcutTriggerBackend };
}

export interface HasAppVisibilityQuery {
  readonly app: { readonly visibility: ApplicationVisibilityBackend };
}

export interface HasClipboardBookmark {
  readonly clipboard: { readonly bookmark: ClipboardBookmarkBackend };
}

export interface HasClipboardChange {
  readonly clipboard: {
    readonly change: Required<Pick<ClipboardChangeBackend, 'subscribe' | 'unsubscribe'>>;
  };
}

export interface HasClipboardFormats {
  readonly clipboard: { readonly formats: ClipboardFormatsBackend };
}

export interface HasClipboardImage {
  readonly clipboard: { readonly image: ClipboardImageBackend };
}

export interface HasClipboardText {
  readonly clipboard: { readonly text: ClipboardTextBackend };
}
export interface HasConnectivityChange {
  readonly connectivity: { readonly change: ConnectivityChangeBackend };
}
export interface HasConnectivityReachability {
  readonly connectivity: {
    readonly reachability: ConnectivityReachabilityBackend;
  };
}
export interface HasConnectivityStatus {
  readonly connectivity: { readonly status: ConnectivityStatusBackend };
}
export interface HasDialogDirectoryOpen {
  readonly dialog: { readonly directoryOpen: DirectoryOpenDialogBackend };
}

export interface HasDialogFileOpen {
  readonly dialog: { readonly fileOpen: FileOpenDialogBackend };
}

export interface HasDialogFileSave {
  readonly dialog: { readonly fileSave: FileSaveDialogBackend };
}

export interface HasDialogImageOpen {
  readonly dialog: { readonly imageOpen: ImageOpenDialogBackend };
}

export interface HasDialogMessage {
  readonly dialog: { readonly message: MessageDialogBackend };
}

export interface HasDialogPhotoCapture {
  readonly dialog: { readonly photoCapture: PhotoCaptureDialogBackend };
}

export interface HasDialogPrompt {
  readonly dialog: { readonly prompt: PromptDialogBackend };
}

export interface HasDialogVideoCapture {
  readonly dialog: { readonly videoCapture: VideoCaptureDialogBackend };
}

export interface HasGraphicsBitmapEncode {
  readonly graphics: { readonly bitmapEncode: BitmapEncodeBackend };
}

export interface HasGraphicsBitmapReadback {
  readonly graphics: { readonly bitmapReadback: BitmapReadbackBackend };
}

export interface HasGraphicsImage {
  readonly graphics: { readonly image: ImageBackend };
}

export interface HasGraphicsPathBoolean {
  readonly graphics: { readonly pathBoolean: PathBooleanBackend };
}

export interface HasGraphicsRenderContextSubscription {
  readonly graphics: { readonly renderContext: RenderContextBackend };
}

export interface HasGraphicsRenderSurface {
  readonly graphics: { readonly renderSurface: RenderSurfaceBackend };
}

export interface HasGraphicsWgpuHost {
  readonly graphics: { readonly wgpuHost: WgpuHostBackend };
}

export interface HasInputDropFileSubscription {
  readonly input: { readonly dropFile: InputDropFileBackend };
}

export interface HasInputFocusSubscription {
  readonly input: { readonly focus: InputFocusBackend };
}

export interface HasInputHaptics {
  readonly input: { readonly haptics: HapticsBackend };
}

export interface HasInputIngress {
  readonly input: { readonly ingress: InputIngressBackend };
}

export interface HasInputPointerLock {
  readonly input: { readonly pointerLock: InputPointerLockBackend };
}

export interface HasInputTargetPreparation {
  readonly input: { readonly target: InputTargetBackend };
}

export interface HasSoftKeyboardAccessoryBar {
  readonly input: {
    readonly softKeyboardAccessoryBar: SoftKeyboardAccessoryBarBackend;
  };
}

export interface HasSoftKeyboardChange {
  readonly input: { readonly softKeyboardChange: SoftKeyboardChangeBackend };
}

export interface HasSoftKeyboardInfo {
  readonly input: { readonly softKeyboardInfo: SoftKeyboardInfoBackend };
}

export interface HasSoftKeyboardResizeModeWrite {
  readonly input: {
    readonly softKeyboardResizeModeWrite: SoftKeyboardResizeModeWriteBackend;
  };
}

export interface HasSoftKeyboardScrollAssist {
  readonly input: {
    readonly softKeyboardScrollAssist: SoftKeyboardScrollAssistBackend;
  };
}

export interface HasSoftKeyboardStyle {
  readonly input: { readonly softKeyboardStyle: SoftKeyboardStyleBackend };
}

export interface HasSoftKeyboardVisibility {
  readonly input: {
    readonly softKeyboardVisibility: SoftKeyboardVisibilityBackend;
  };
}

export interface HasIpcHandle {
  readonly ipc: { readonly handle: IpcHandleBackend };
}

export interface HasIpcInvoke {
  readonly ipc: { readonly invoke: IpcInvokeBackend };
}

export interface HasIpcMessage {
  readonly ipc: { readonly message: IpcMessageBackend };
}

export interface HasIpcSend {
  readonly ipc: { readonly send: IpcSendBackend };
}

export interface HasIpcTargetedSend<Target> {
  readonly ipc: { readonly targetedSend: IpcTargetedSendBackend<Target> };
}

export interface HasMediaAudioCodec {
  readonly media: { readonly audioCodec: AudioBackend };
}

export interface HasMediaAudioDevice {
  readonly media: { readonly audioDevice: AudioDeviceBackend };
}

export interface HasMediaSession {
  readonly media: { readonly session: MediaSessionBackend };
}

export interface HasMediaSessionAction {
  readonly media: { readonly sessionAction: MediaSessionActionBackend };
}

export interface HasMediaVideo {
  readonly media: { readonly video: VideoCapabilityBackend };
}

export interface HasNetHttp {
  readonly net: { readonly http: NetBackend };
}

export interface HasNetSocket {
  readonly net: { readonly socket: SocketBackend };
}

export interface HasMidiAccess {
  readonly midi: { readonly access: MidiAccessBackend };
}

export interface HasMidiPermission {
  readonly midi: { readonly permission: MidiPermissionBackend };
}

export interface HasNotificationAction {
  readonly notification: { readonly action: NotificationActionBackend };
}

export interface HasNotificationActiveList {
  readonly notification: { readonly activeList: NotificationActiveListBackend };
}

export interface HasNotificationClick {
  readonly notification: { readonly click: NotificationClickBackend };
}

export interface HasNotificationClose {
  readonly notification: { readonly close: NotificationCloseBackend };
}

export interface HasNotificationDelivery {
  readonly notification: { readonly delivery: NotificationDeliveryBackend };
}

export interface HasNotificationDismiss {
  readonly notification: { readonly dismiss: NotificationDismissBackend };
}

export interface HasNotificationLifecycle {
  readonly notification: { readonly lifecycle: NotificationLifecycleBackend };
}

export interface HasNotificationPermission {
  readonly notification: { readonly permission: NotificationPermissionBackend };
}

export interface HasNotificationReceived {
  readonly notification: { readonly received: NotificationReceivedBackend };
}

export interface HasNotificationReply {
  readonly notification: { readonly reply: NotificationReplyBackend };
}

export interface HasNotificationScheduling {
  readonly notification: { readonly scheduling: NotificationSchedulingBackend };
}

export interface HasStorageFileSystem {
  readonly storage: { readonly fileSystem: FileSystemHostBackend };
}

export interface HasPowerBatteryHealth {
  readonly power: { readonly batteryHealth: PowerBatteryHealthBackend };
}

export interface HasPowerChange {
  readonly power: { readonly change: PowerChangeBackend };
}

export interface HasPowerIdle {
  readonly power: { readonly idle: PowerIdleBackend };
}

export interface HasPowerKeepAwake {
  readonly power: { readonly keepAwake: PowerKeepAwakeBackend };
}

export interface HasPowerSessionLock {
  readonly power: { readonly sessionLock: PowerSessionLockBackend };
}

export interface HasPowerStatus {
  readonly power: { readonly status: PowerStatusBackend };
}

export interface HasPowerSuspension {
  readonly power: { readonly suspension: PowerSuspensionBackend };
}

export interface HasPowerThermal {
  readonly power: { readonly thermal: PowerThermalBackend };
}

export interface HasStorageChange {
  readonly storage: { readonly change: StorageChangeBackend };
}

export interface HasStorageLocal {
  readonly storage: { readonly local: StorageBackend };
}

export interface HasStoragePersistenceQuery {
  readonly storage: { readonly persistenceQuery: StoragePersistenceQueryBackend };
}

export interface HasStoragePersistenceRequest {
  readonly storage: { readonly persistenceRequest: StoragePersistenceRequestBackend };
}

export interface HasSystemDevice {
  readonly system: { readonly device: DeviceBackend };
}

export interface HasSystemGeolocation {
  readonly system: { readonly geolocation: GeolocationBackend };
}

export interface HasSystemLifecycle {
  readonly system: { readonly lifecycle: LifecycleBackend };
}

export interface HasSystemPlatform {
  readonly system: { readonly platform: PlatformBackend };
}

export interface HasScreenChange {
  readonly screen: { readonly change: ScreenChangeBackend };
}

export interface HasScreenDetails {
  readonly screen: { readonly details: ScreenDetailsBackend };
}

export interface HasScreenPermissionChange {
  readonly screen: { readonly permissionChange: ScreenPermissionChangeBackend };
}

export interface HasScreenQuery {
  readonly screen: { readonly query: ScreenQueryBackend };
}

export interface HasSystemSensors {
  readonly system: { readonly sensors: SensorsBackend };
}

export interface HasTextBidiClass {
  readonly text: { readonly bidiClass: BidiClassBackend };
}

export interface HasTextFontLoading {
  readonly text: { readonly fontLoading: FontLoadingBackend };
}

export interface HasTextGlyphRasterizer {
  readonly text: { readonly glyphRasterizer: GlyphRasterizerBackend };
}

export interface HasTextSegmenter {
  readonly text: { readonly segmenter: TextSegmenterBackend };
}

export interface HasTextShaper {
  readonly text: { readonly shaper: TextShaperBackend };
}

export interface HasUiFullscreen {
  readonly ui: { readonly fullscreen: FullscreenBackend };
}

export interface HasUiFullscreenSubscription {
  readonly ui: {
    readonly fullscreen: Required<Pick<FullscreenBackend, 'subscribe' | 'unsubscribe'>>;
  };
}

export interface HasMenuApplication {
  readonly menu: { readonly application: MenuApplicationBackend };
}

export interface HasMenuHighlight {
  readonly menu: { readonly highlight: MenuHighlightBackend };
}

export interface HasMenuPopup {
  readonly menu: { readonly popup: MenuPopupBackend };
}

export interface HasMenuSelect {
  readonly menu: { readonly select: MenuSelectBackend };
}

export interface HasShareContent {
  readonly share: { readonly content: ShareContentBackend };
}

export interface HasShareFiles {
  readonly share: { readonly files: ShareFilesBackend };
}

export interface HasShellBeep {
  readonly shell: { readonly beep: ShellBeepBackend };
}

export interface HasShellExternal {
  readonly shell: { readonly external: ShellExternalBackend };
}

export interface HasShellPathOpen {
  readonly shell: { readonly pathOpen: ShellPathOpenBackend };
}

export interface HasShellPathReveal {
  readonly shell: { readonly pathReveal: ShellPathRevealBackend };
}

export interface HasShellShortcutLink {
  readonly shell: { readonly shortcutLink: ShellShortcutLinkBackend };
}

export interface HasShellTrash {
  readonly shell: { readonly trash: ShellTrashBackend };
}

export interface HasUiStatusBarChange {
  readonly ui: { readonly statusBarChange: StatusBarChangeBackend };
}

export interface HasUiStatusBarColor {
  readonly ui: { readonly statusBarColor: StatusBarColorBackend };
}

export interface HasUiStatusBarInfo {
  readonly ui: { readonly statusBarInfo: StatusBarInfoBackend };
}

export interface HasUiStatusBarOverlays {
  readonly ui: { readonly statusBarOverlays: StatusBarOverlaysBackend };
}

export interface HasUiStatusBarStyle {
  readonly ui: { readonly statusBarStyle: StatusBarStyleBackend };
}

export type HasUiStatusBarStyleStack = HasUiStatusBarColor &
  HasUiStatusBarInfo &
  HasUiStatusBarOverlays &
  HasUiStatusBarStyle &
  HasUiStatusBarVisibility;

export interface HasUiStatusBarVisibility {
  readonly ui: { readonly statusBarVisibility: StatusBarVisibilityBackend };
}

export interface HasTrayLifecycle {
  readonly tray: { readonly lifecycle: TrayLifecycleBackend };
}

export interface HasTrayImage {
  readonly tray: { readonly image: TrayImageBackend };
}

export interface HasTrayTitle {
  readonly tray: { readonly title: TrayTitleBackend };
}

export interface HasTrayTooltip {
  readonly tray: { readonly tooltip: TrayTooltipBackend };
}

export interface HasTrayMenu {
  readonly tray: { readonly menu: TrayMenuBackend };
}

export interface HasTrayTemplateImage {
  readonly tray: { readonly templateImage: TrayTemplateImageBackend };
}

export interface HasTrayBounds {
  readonly tray: { readonly bounds: TrayBoundsBackend };
}

export interface HasTrayPopupMenu {
  readonly tray: { readonly popupMenu: TrayPopupMenuBackend };
}

export interface HasTrayDoubleClickPolicy {
  readonly tray: { readonly doubleClickPolicy: TrayDoubleClickPolicyBackend };
}

export interface HasTrayPressedImage {
  readonly tray: { readonly pressedImage: TrayPressedImageBackend };
}

export interface HasTrayBalloon {
  readonly tray: { readonly balloon: TrayBalloonBackend };
}

export interface HasTrayInteractionEvents {
  readonly tray: { readonly interactionEvents: TrayInteractionEventsBackend };
}

export interface HasTrayMenuSelectionEvents {
  readonly tray: {
    readonly menuSelectionEvents: TrayMenuSelectionEventsBackend;
  };
}

export interface HasTrayBalloonEvents {
  readonly tray: { readonly balloonEvents: TrayBalloonEventsBackend };
}

export interface HasTrayDropEvents {
  readonly tray: { readonly dropEvents: TrayDropEventsBackend };
}

export interface HasWindowAttach {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'attach' | 'close'>>;
}

export interface HasWindowCloseSubscription {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'subscribeClose'>>;
}

export interface HasWindowMoveSubscription {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'subscribeMove'>>;
}

export interface HasWindowOpen {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'close' | 'open'>>;
}

export interface HasWindowOrientationSubscription {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'subscribeOrientation'>>;
}

export interface HasWindowResizeSubscription {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'subscribeResize'>>;
}

export interface HasWindowVisibilitySubscription {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'subscribeVisibility'>>;
}
