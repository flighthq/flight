import type { AccessibilityBackend } from './Accessibility';
import type { AppBackend } from './App';
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
import type { FileDialogBackend } from './FileDialogBackend';
import type { FileSystemBackend } from './FileSystem';
import type { FontLoadingBackend } from './FontLoadingBackend';
import type { FullscreenBackend } from './FullscreenBackend';
import type { GeolocationBackend } from './Geolocation';
import type { GlyphRasterizerBackend } from './GlyphSource';
import type { HapticsBackend } from './Haptics';
import type { ImageBackend } from './Image';
import type { InputIngressBackend } from './InputIngressBackend';
import type { InputTargetBackend } from './InputTargetBackend';
import type { IpcBackend } from './Ipc';
import type { SoftKeyboardBackend } from './Keyboard';
import type { LifecycleBackend } from './Lifecycle';
import type { LogTransportBackend } from './Log';
import type { LoopBackend } from './LoopBackend';
import type { MediaSessionBackend } from './MediaSession';
import type { MenuApplicationBackend, MenuHighlightBackend, MenuPopupBackend, MenuSelectBackend } from './Menu';
import type { MessageDialogBackend } from './MessageDialogBackend';
import type { NetBackend } from './Net';
import type {
  NotificationActionBackend,
  NotificationActiveListBackend,
  NotificationClickBackend,
  NotificationCloseBackend,
  NotificationDeliveryBackend,
  NotificationDismissBackend,
  NotificationReplyBackend,
  NotificationSchedulingBackend,
  NotificationShowBackend,
  NotificationUpdateBackend,
} from './Notification';
import type { PathBooleanBackend } from './PathBooleanBackend';
import type { PermissionBackend } from './Permission';
import type { PlatformBackend } from './Platform';
import type { PowerBackend } from './Power';
import type { PromptDialogBackend } from './PromptDialogBackend';
import type { ProtocolBackend } from './Protocol';
import type {
  ScreenChangeBackend,
  ScreenDetailsBackend,
  ScreenPermissionChangeBackend,
  ScreenQueryBackend,
} from './Screen';
import type { SensorsBackend } from './Sensors';
import type { ShareContentBackend, ShareFilesBackend } from './Share';
import type { ShellBackend } from './Shell';
import type { ShortcutBackend } from './Shortcut';
import type { SocketBackend } from './Socket';
import type { StatusBarBackend } from './StatusBar';
import type { StorageBackend } from './Storage';
import type { TextSegmenterBackend } from './TextSegment';
import type { TextShaperBackend } from './TextShaper';
import type { TrayBackend } from './Tray';
import type { UpdaterBackend } from './Updater';
import type { VideoCapabilityBackend } from './VideoCapabilityBackend';
import type { WebcamBackend } from './Webcam';
import type { WgpuHostBackend } from './WgpuHost';

export interface Host extends Entity {
  readonly accessibility: HostAccessibilityCapabilities;
  readonly app: HostAppCapabilities;
  readonly clipboard: HostClipboardCapabilities;
  readonly connectivity: HostConnectivityCapabilities;
  readonly dialog: HostDialogCapabilities;
  readonly graphics: HostGraphicsCapabilities;
  readonly input: HostInputCapabilities;
  readonly media: HostMediaCapabilities;
  readonly menu: HostMenuCapabilities;
  readonly net: HostNetCapabilities;
  readonly notification: HostNotificationCapabilities;
  readonly screen: HostScreenCapabilities;
  readonly share: HostShareCapabilities;
  readonly storage: HostStorageCapabilities;
  readonly system: HostSystemCapabilities;
  readonly text: HostTextCapabilities;
  readonly ui: HostUiCapabilities;
  readonly window: WindowBackend;
}

export interface HostAccessibilityCapabilities {
  readonly provider?: AccessibilityBackend;
}

export interface HostAppCapabilities {
  readonly exit?: ApplicationExitBackend;
  readonly identity?: AppBackend;
  readonly ipc?: IpcBackend;
  readonly logTransport?: LogTransportBackend;
  readonly loop?: LoopBackend;
  readonly protocol?: ProtocolBackend;
  readonly shortcut?: ShortcutBackend;
  readonly updater?: UpdaterBackend;
  readonly visibility?: ApplicationVisibilityBackend;
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
  readonly file?: FileDialogBackend;
  readonly message?: MessageDialogBackend;
  readonly prompt?: PromptDialogBackend;
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
  readonly softKeyboard?: SoftKeyboardBackend;
  readonly target?: InputTargetBackend;
}

export interface HostMediaCapabilities {
  readonly audioCodec?: AudioBackend;
  readonly audioDevice?: AudioDeviceBackend;
  readonly session?: MediaSessionBackend;
  readonly video?: VideoCapabilityBackend;
  readonly webcam?: WebcamBackend;
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
  readonly reply?: NotificationReplyBackend;
  readonly scheduling?: NotificationSchedulingBackend;
  readonly show?: NotificationShowBackend;
  readonly update?: NotificationUpdateBackend;
}

// Share is top-level because content and Flight data-URL files have different provider coverage.
// Omission is capability absence; providers never install a stub that merely answers false.
export interface HostShareCapabilities {
  readonly content?: ShareContentBackend;
  readonly files?: ShareFilesBackend;
}

export interface HostScreenCapabilities {
  readonly change?: ScreenChangeBackend;
  readonly details?: ScreenDetailsBackend;
  readonly permissionChange?: ScreenPermissionChangeBackend;
  readonly query?: ScreenQueryBackend;
}

export interface HostStorageCapabilities {
  readonly fileSystem?: FileSystemBackend;
  readonly local?: StorageBackend;
}

export interface HostSystemCapabilities {
  readonly device?: DeviceBackend;
  readonly geolocation?: GeolocationBackend;
  readonly lifecycle?: LifecycleBackend;
  readonly permissions?: PermissionBackend;
  readonly platform?: PlatformBackend;
  readonly power?: PowerBackend;
  readonly sensors?: SensorsBackend;
}

export interface HostTextCapabilities {
  readonly bidiClass?: BidiClassBackend;
  readonly fontLoading?: FontLoadingBackend;
  readonly glyphRasterizer?: GlyphRasterizerBackend;
  readonly segmenter?: TextSegmenterBackend;
  readonly shaper?: TextShaperBackend;
}

export interface HostUiCapabilities {
  readonly fullscreen?: FullscreenBackend;
  readonly shell?: ShellBackend;
  readonly statusBar?: StatusBarBackend;
  readonly tray?: TrayBackend;
}

export interface HasAccessibilityProvider {
  readonly accessibility: { readonly provider: AccessibilityBackend };
}

export interface HasAppExitSubscription {
  readonly app: { readonly exit: ApplicationExitBackend };
}

export interface HasAppIdentity {
  readonly app: { readonly identity: AppBackend };
}

export interface HasAppIpc {
  readonly app: { readonly ipc: IpcBackend };
}

export interface HasAppLogTransport {
  readonly app: { readonly logTransport: LogTransportBackend };
}

export interface HasAppLoop {
  readonly app: { readonly loop: LoopBackend };
}

export interface HasAppProtocol {
  readonly app: { readonly protocol: ProtocolBackend };
}

export interface HasAppShortcut {
  readonly app: { readonly shortcut: ShortcutBackend };
}

export interface HasAppUpdater {
  readonly app: { readonly updater: UpdaterBackend };
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
  readonly connectivity: { readonly reachability: ConnectivityReachabilityBackend };
}
export interface HasConnectivityStatus {
  readonly connectivity: { readonly status: ConnectivityStatusBackend };
}

export interface HasDialogFile {
  readonly dialog: { readonly file: FileDialogBackend };
}

export interface HasDialogMessage {
  readonly dialog: { readonly message: MessageDialogBackend };
}

export interface HasDialogPrompt {
  readonly dialog: { readonly prompt: PromptDialogBackend };
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

export interface HasInputSoftKeyboard {
  readonly input: { readonly softKeyboard: SoftKeyboardBackend };
}

export interface HasInputTargetPreparation {
  readonly input: { readonly target: InputTargetBackend };
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

export interface HasMediaVideo {
  readonly media: { readonly video: VideoCapabilityBackend };
}

export interface HasMediaWebcam {
  readonly media: { readonly webcam: WebcamBackend };
}

export interface HasNetHttp {
  readonly net: { readonly http: NetBackend };
}

export interface HasNetSocket {
  readonly net: { readonly socket: SocketBackend };
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

export interface HasNotificationReply {
  readonly notification: { readonly reply: NotificationReplyBackend };
}

export interface HasNotificationScheduling {
  readonly notification: { readonly scheduling: NotificationSchedulingBackend };
}

export interface HasNotificationShow {
  readonly notification: { readonly show: NotificationShowBackend };
}

export interface HasNotificationUpdate {
  readonly notification: { readonly update: NotificationUpdateBackend };
}

export interface HasStorageFileSystem {
  readonly storage: { readonly fileSystem: FileSystemBackend };
}

export interface HasStorageLocal {
  readonly storage: { readonly local: StorageBackend };
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

export interface HasSystemPermissions {
  readonly system: { readonly permissions: PermissionBackend };
}

export interface HasSystemPlatform {
  readonly system: { readonly platform: PlatformBackend };
}

export interface HasSystemPower {
  readonly system: { readonly power: PowerBackend };
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
  readonly ui: { readonly fullscreen: Required<Pick<FullscreenBackend, 'subscribe' | 'unsubscribe'>> };
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

export interface HasUiShell {
  readonly ui: { readonly shell: ShellBackend };
}

export interface HasUiStatusBar {
  readonly ui: { readonly statusBar: StatusBarBackend };
}

export interface HasUiTray {
  readonly ui: { readonly tray: TrayBackend };
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
