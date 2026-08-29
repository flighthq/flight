import type { AccessibilityBackend } from './Accessibility';
import type { AppBackend } from './App';
import type { WindowBackend } from './ApplicationWindow';
import type { AudioBackend } from './AudioBackend';
import type { AudioDeviceBackend } from './AudioDeviceBackend';
import type { BidiClassBackend } from './Bidi';
import type { BitmapEncodeBackend } from './BitmapEncodeBackend';
import type { BitmapReadbackBackend } from './BitmapReadbackBackend';
import type { ClipboardBackend } from './Clipboard';
import type { ConnectivityBackend } from './Connectivity';
import type { DeviceBackend } from './Device';
import type { FileDialogBackend } from './FileDialogBackend';
import type { FileSystemBackend } from './FileSystem';
import type { FontLoadingBackend } from './FontLoadingBackend';
import type { FullscreenBackend } from './FullscreenBackend';
import type { GeolocationBackend } from './Geolocation';
import type { GlyphRasterizerBackend } from './GlyphSource';
import type { HapticsBackend } from './Haptics';
import type { ImageBackend } from './Image';
import type { InputIngressBackend } from './InputIngressBackend';
import type { IpcBackend } from './Ipc';
import type { SoftKeyboardBackend } from './Keyboard';
import type { LifecycleBackend } from './Lifecycle';
import type { LogTransportBackend } from './Log';
import type { LoopBackend } from './LoopBackend';
import type { MediaSessionBackend } from './MediaSession';
import type { MenuBackend } from './Menu';
import type { MessageDialogBackend } from './MessageDialogBackend';
import type { NetBackend } from './Net';
import type { NotificationBackend } from './Notification';
import type { PathBooleanBackend } from './PathBooleanBackend';
import type { PermissionBackend } from './Permission';
import type { PlatformBackend } from './Platform';
import type { PowerBackend } from './Power';
import type { PromptDialogBackend } from './PromptDialogBackend';
import type { ProtocolBackend } from './Protocol';
import type { ScreenBackend } from './Screen';
import type { SensorsBackend } from './Sensors';
import type { ShareBackend } from './Share';
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

export interface Host {
  readonly accessibility: HostAccessibilityCapabilities;
  readonly app: HostAppCapabilities;
  readonly dialog: HostDialogCapabilities;
  readonly graphics: HostGraphicsCapabilities;
  readonly input: HostInputCapabilities;
  readonly media: HostMediaCapabilities;
  readonly net: HostNetCapabilities;
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
  readonly identity?: AppBackend;
  readonly ipc?: IpcBackend;
  readonly logTransport?: LogTransportBackend;
  readonly loop?: LoopBackend;
  readonly protocol?: ProtocolBackend;
  readonly shortcut?: ShortcutBackend;
  readonly updater?: UpdaterBackend;
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
  readonly wgpuHost?: WgpuHostBackend;
}

export interface HostInputCapabilities {
  readonly haptics?: HapticsBackend;
  readonly ingress?: InputIngressBackend;
  readonly softKeyboard?: SoftKeyboardBackend;
}

export interface HostMediaCapabilities {
  readonly audioCodec?: AudioBackend;
  readonly audioDevice?: AudioDeviceBackend;
  readonly session?: MediaSessionBackend;
  readonly video?: VideoCapabilityBackend;
  readonly webcam?: WebcamBackend;
}

export interface HostNetCapabilities {
  readonly connectivity?: ConnectivityBackend;
  readonly http?: NetBackend;
  readonly socket?: SocketBackend;
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
  readonly screen?: ScreenBackend;
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
  readonly clipboard?: ClipboardBackend;
  readonly fullscreen?: FullscreenBackend;
  readonly menu?: MenuBackend;
  readonly notification?: NotificationBackend;
  readonly share?: ShareBackend;
  readonly shell?: ShellBackend;
  readonly statusBar?: StatusBarBackend;
  readonly tray?: TrayBackend;
}

export interface HasAccessibilityProvider {
  readonly accessibility: { readonly provider: AccessibilityBackend };
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

export interface HasGraphicsWgpuHost {
  readonly graphics: { readonly wgpuHost: WgpuHostBackend };
}

export interface HasInputHaptics {
  readonly input: { readonly haptics: HapticsBackend };
}

export interface HasInputIngress {
  readonly input: { readonly ingress: InputIngressBackend };
}

export interface HasInputSoftKeyboard {
  readonly input: { readonly softKeyboard: SoftKeyboardBackend };
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

export interface HasNetConnectivity {
  readonly net: { readonly connectivity: ConnectivityBackend };
}

export interface HasNetHttp {
  readonly net: { readonly http: NetBackend };
}

export interface HasNetSocket {
  readonly net: { readonly socket: SocketBackend };
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

export interface HasSystemScreen {
  readonly system: { readonly screen: ScreenBackend };
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

export interface HasUiClipboard {
  readonly ui: { readonly clipboard: ClipboardBackend };
}

export interface HasUiFullscreen {
  readonly ui: { readonly fullscreen: FullscreenBackend };
}

export interface HasUiFullscreenSubscription {
  readonly ui: { readonly fullscreen: Required<Pick<FullscreenBackend, 'subscribe' | 'unsubscribe'>> };
}

export interface HasUiMenu {
  readonly ui: { readonly menu: MenuBackend };
}

export interface HasUiNotification {
  readonly ui: { readonly notification: NotificationBackend };
}

export interface HasUiShare {
  readonly ui: { readonly share: ShareBackend };
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

export interface HasWindowOpen {
  readonly window: WindowBackend & Required<Pick<WindowBackend, 'close' | 'open'>>;
}
