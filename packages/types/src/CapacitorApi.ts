// The precise slice of the Capacitor JavaScript plugin API — `@capacitor/core` plus the official
// plugins — that Flight's host backends call. The real Capacitor plugin objects satisfy this
// structurally, so a consumer aggregates them and passes the object directly:
//
//   import { App } from '@capacitor/app';
//   import { Clipboard } from '@capacitor/clipboard';
//   import { Device } from '@capacitor/device';
//   import { Dialog } from '@capacitor/dialog';
//   import { Filesystem } from '@capacitor/filesystem';
//   import { Geolocation } from '@capacitor/geolocation';
//   import { Haptics } from '@capacitor/haptics';
//   import { Keyboard } from '@capacitor/keyboard';
//   import { LocalNotifications } from '@capacitor/local-notifications';
//   import { Network } from '@capacitor/network';
//   import { Share } from '@capacitor/share';
//   import { StatusBar } from '@capacitor/status-bar';
//   registerCapacitorBackends({ app: App, clipboard: Clipboard, device: Device, dialog: Dialog,
//     filesystem: Filesystem, geolocation: Geolocation, haptics: Haptics, keyboard: Keyboard,
//     localNotifications: LocalNotifications, network: Network, share: Share, statusBar: StatusBar });
//
// Typing it here (rather than importing `@capacitor/*`) keeps this package dependency-free and unit
// testable with a fake — and documents exactly which Capacitor surface the seams require, which is the
// real coupling between Flight and a Capacitor host. Members are intentionally minimal; widen only when
// a backend needs more. Note the wide async/sync gap: every Capacitor plugin call is Promise-based,
// while several Flight seams (device/statusbar/connectivity snapshot getters, keyboard info) are
// synchronous. Those adapters prefetch-and-cache (and, where the value is live, subscribe to keep the
// cache fresh) — see each adapter for the exact contract. `@capacitor/preferences` is deliberately
// absent: `StorageBackend` is synchronous but Preferences is async, an unbridgeable mismatch, so the
// storage seam keeps its web default rather than being adapted (see registerCapacitorBackends).

export interface CapacitorApi {
  app: CapacitorAppPlugin;
  clipboard: CapacitorClipboardPlugin;
  device: CapacitorDevicePlugin;
  dialog: CapacitorDialogPlugin;
  filesystem: CapacitorFilesystemPlugin;
  geolocation: CapacitorGeolocationPlugin;
  haptics: CapacitorHapticsPlugin;
  keyboard: CapacitorKeyboardPlugin;
  localNotifications: CapacitorLocalNotificationsPlugin;
  network: CapacitorNetworkPlugin;
  share: CapacitorSharePlugin;
  statusBar: CapacitorStatusBarPlugin;
}

// Handle every `addListener` resolves to; `remove` detaches the subscription. Fire-and-forget: the sync
// Flight subscribe seams call addListener and return an unsubscribe closure that awaits this handle.
export interface CapacitorPluginListenerHandle {
  remove(): Promise<void>;
}

// `@capacitor/app` — application identity/control (Android exit/minimize) and lifecycle/url events. All
// async; the sync AppBackend name/version getters are served from a value prefetched at construction.
export interface CapacitorAppPlugin {
  addListener(
    eventName: 'appStateChange',
    listener: (state: Readonly<{ isActive: boolean }>) => void,
  ): Promise<CapacitorPluginListenerHandle>;
  addListener(
    eventName: 'appUrlOpen',
    listener: (event: Readonly<{ url: string }>) => void,
  ): Promise<CapacitorPluginListenerHandle>;
  exitApp(): Promise<void>;
  getInfo(): Promise<CapacitorAppInfo>;
  minimizeApp(): Promise<void>;
}

export interface CapacitorAppInfo {
  build: string;
  id: string;
  name: string;
  version: string;
}

// `@capacitor/clipboard` — the async system clipboard. `read` returns `{ value, type }`, where an image
// crosses as a data-URL value with an `image/*` type. Text and (data-URL) image round-trip; the other
// ClipboardBackend flavors (HTML/RTF/bookmark/files/formats/change-count) have no Capacitor call.
export interface CapacitorClipboardPlugin {
  read(): Promise<CapacitorClipboardReadResult>;
  write(options: Readonly<CapacitorClipboardWriteOptions>): Promise<void>;
}

export interface CapacitorClipboardReadResult {
  type: string;
  value: string;
}

export interface CapacitorClipboardWriteOptions {
  image?: string;
  label?: string;
  string?: string;
  url?: string;
}

// `@capacitor/device` — device identity. All async, so the sync DeviceBackend getInfo/getId are served
// from values prefetched once at construction (async→sync bridge; sentinels until the probe resolves).
export interface CapacitorDevicePlugin {
  getId(): Promise<CapacitorDeviceId>;
  getInfo(): Promise<CapacitorDeviceInfo>;
}

export interface CapacitorDeviceId {
  identifier: string;
}

export interface CapacitorDeviceInfo {
  isVirtual: boolean;
  manufacturer: string;
  model: string;
  name?: string;
  operatingSystem: string;
  osVersion: string;
  platform: string;
  webViewVersion: string;
}

// `@capacitor/dialog` — native message/confirm/prompt dialogs. `alert` is a single-button
// acknowledgement; `confirm` and `prompt` return a value. There is no native file picker here, so the
// DialogBackend open/save methods report their sentinels.
export interface CapacitorDialogPlugin {
  alert(options: Readonly<CapacitorDialogAlertOptions>): Promise<void>;
  confirm(options: Readonly<CapacitorDialogConfirmOptions>): Promise<CapacitorDialogConfirmResult>;
  prompt(options: Readonly<CapacitorDialogPromptOptions>): Promise<CapacitorDialogPromptResult>;
}

export interface CapacitorDialogAlertOptions {
  buttonTitle?: string;
  message: string;
  title?: string;
}

export interface CapacitorDialogConfirmOptions {
  cancelButtonTitle?: string;
  message: string;
  okButtonTitle?: string;
  title?: string;
}

export interface CapacitorDialogConfirmResult {
  value: boolean;
}

export interface CapacitorDialogPromptOptions {
  cancelButtonTitle?: string;
  inputPlaceholder?: string;
  inputText?: string;
  message: string;
  okButtonTitle?: string;
  title?: string;
}

export interface CapacitorDialogPromptResult {
  cancelled: boolean;
  value: string;
}

// `@capacitor/filesystem` — async file I/O. Text uses the `utf8` encoding; binary omits `encoding` and
// crosses as a Base64 string. The FileSystemBackend methods without a Capacitor call (streams, symlinks,
// permissions, watch, usage) report their sentinels. Paths are forwarded as-is: the caller supplies a
// Capacitor-resolvable path (a `file://` URI or a path under a configured Directory).
export interface CapacitorFilesystemPlugin {
  appendFile(options: Readonly<CapacitorFilesystemWriteOptions>): Promise<void>;
  copy(options: Readonly<CapacitorFilesystemCopyOptions>): Promise<void>;
  deleteFile(options: Readonly<CapacitorFilesystemPathOptions>): Promise<void>;
  mkdir(options: Readonly<CapacitorFilesystemMkdirOptions>): Promise<void>;
  readFile(options: Readonly<CapacitorFilesystemReadOptions>): Promise<CapacitorFilesystemReadResult>;
  readdir(options: Readonly<CapacitorFilesystemPathOptions>): Promise<CapacitorFilesystemReaddirResult>;
  rename(options: Readonly<CapacitorFilesystemCopyOptions>): Promise<void>;
  rmdir(options: Readonly<CapacitorFilesystemRmdirOptions>): Promise<void>;
  stat(options: Readonly<CapacitorFilesystemPathOptions>): Promise<CapacitorFilesystemStatResult>;
  writeFile(options: Readonly<CapacitorFilesystemWriteOptions>): Promise<CapacitorFilesystemWriteResult>;
}

export interface CapacitorFilesystemPathOptions {
  path: string;
}

export interface CapacitorFilesystemReadOptions {
  encoding?: string;
  path: string;
}

export interface CapacitorFilesystemReadResult {
  data: string;
}

export interface CapacitorFilesystemWriteOptions {
  data: string;
  encoding?: string;
  path: string;
  recursive?: boolean;
}

export interface CapacitorFilesystemWriteResult {
  uri: string;
}

export interface CapacitorFilesystemCopyOptions {
  from: string;
  to: string;
}

export interface CapacitorFilesystemMkdirOptions {
  path: string;
  recursive?: boolean;
}

export interface CapacitorFilesystemRmdirOptions {
  path: string;
  recursive?: boolean;
}

export interface CapacitorFilesystemReaddirResult {
  files: CapacitorFileInfo[];
}

// A `readdir`/`stat` entry. `type` is Capacitor's discriminant ('directory' | 'file'); `mtime` is epoch
// milliseconds.
export interface CapacitorFileInfo {
  ctime?: number;
  mtime: number;
  name: string;
  size: number;
  type: string;
  uri: string;
}

export interface CapacitorFilesystemStatResult {
  ctime?: number;
  mtime: number;
  size: number;
  type: string;
  uri: string;
}

// `@capacitor/geolocation` — device location. Async; permission getters map through
// check/requestPermissions. `watchPosition` resolves a string callback id, whereas GeolocationBackend
// returns a number synchronously — the adapter mints a local numeric id and maps it to the resolved
// string for clearWatch (fire-and-forget).
export interface CapacitorGeolocationPlugin {
  checkPermissions(): Promise<CapacitorGeolocationPermissionStatus>;
  clearWatch(options: Readonly<{ id: string }>): Promise<void>;
  getCurrentPosition(options?: Readonly<CapacitorGeolocationOptions>): Promise<CapacitorPosition>;
  requestPermissions(
    options?: Readonly<CapacitorGeolocationPermissionOptions>,
  ): Promise<CapacitorGeolocationPermissionStatus>;
  watchPosition(
    options: Readonly<CapacitorGeolocationOptions>,
    callback: (position: CapacitorPosition | null, err?: unknown) => void,
  ): Promise<string>;
}

export interface CapacitorGeolocationOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
}

export interface CapacitorGeolocationPermissionOptions {
  permissions?: string[];
}

// `location` is Capacitor's permission state ('granted' | 'denied' | 'prompt' | 'prompt-with-rationale').
export interface CapacitorGeolocationPermissionStatus {
  coarseLocation?: string;
  location: string;
}

export interface CapacitorPosition {
  coords: CapacitorPositionCoords;
  timestamp: number;
}

export interface CapacitorPositionCoords {
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  latitude: number;
  longitude: number;
  speed: number | null;
}

// `@capacitor/haptics` — physical feedback. Every call is async and returns void; the sync
// HapticsBackend triggers fire-and-forget and report `true`. `style`/`type` are Capacitor's uppercase
// enums ('HEAVY' | 'MEDIUM' | 'LIGHT'; 'SUCCESS' | 'WARNING' | 'ERROR').
export interface CapacitorHapticsPlugin {
  impact(options: Readonly<{ style: string }>): Promise<void>;
  notification(options: Readonly<{ type: string }>): Promise<void>;
  selectionChanged(): Promise<void>;
  selectionEnd(): Promise<void>;
  selectionStart(): Promise<void>;
  vibrate(options: Readonly<{ duration?: number }>): Promise<void>;
}

// `@capacitor/keyboard` — the soft keyboard. Show/hide and the setters are async fire-and-forget; the
// sync SoftKeyboardBackend.getInfo reads a local mirror kept fresh by the plugin's will/did show/hide
// events. `mode`/`style` are Capacitor's enums ('none' | 'body' | 'ionic' | 'native'; 'DARK' | 'LIGHT' |
// 'DEFAULT').
export interface CapacitorKeyboardPlugin {
  addListener(
    eventName: 'keyboardWillShow' | 'keyboardDidShow',
    listener: (info: Readonly<{ keyboardHeight: number }>) => void,
  ): Promise<CapacitorPluginListenerHandle>;
  addListener(
    eventName: 'keyboardWillHide' | 'keyboardDidHide',
    listener: () => void,
  ): Promise<CapacitorPluginListenerHandle>;
  hide(): Promise<void>;
  setAccessoryBarVisible(options: Readonly<{ isVisible: boolean }>): Promise<void>;
  setResizeMode(options: Readonly<{ mode: string }>): Promise<void>;
  setScroll(options: Readonly<{ isDisabled: boolean }>): Promise<void>;
  setStyle(options: Readonly<{ style: string }>): Promise<void>;
  show(): Promise<void>;
}

// `@capacitor/local-notifications` — scheduled/immediate local notifications. Ids are numeric, so the
// adapter maps Flight's string ids onto a monotonic counter. `display` is the permission state
// ('granted' | 'denied' | 'prompt' | 'prompt-with-rationale'), served synchronously from a prefetch.
export interface CapacitorLocalNotificationsPlugin {
  addListener(
    eventName: 'localNotificationActionPerformed',
    listener: (action: Readonly<CapacitorLocalNotificationAction>) => void,
  ): Promise<CapacitorPluginListenerHandle>;
  cancel(options: Readonly<{ notifications: ReadonlyArray<{ id: number }> }>): Promise<void>;
  checkPermissions(): Promise<CapacitorLocalNotificationsPermission>;
  getPending(): Promise<CapacitorLocalNotificationsPending>;
  requestPermissions(): Promise<CapacitorLocalNotificationsPermission>;
  schedule(
    options: Readonly<{ notifications: ReadonlyArray<CapacitorLocalNotificationSchema> }>,
  ): Promise<CapacitorLocalNotificationsScheduleResult>;
}

export interface CapacitorLocalNotificationSchema {
  body?: string;
  id: number;
  schedule?: { at?: Date };
  title: string;
}

export interface CapacitorLocalNotificationsScheduleResult {
  notifications: Array<{ id: number }>;
}

export interface CapacitorLocalNotificationsPending {
  notifications: CapacitorLocalNotificationSchema[];
}

export interface CapacitorLocalNotificationsPermission {
  display: string;
}

export interface CapacitorLocalNotificationAction {
  actionId: string;
  notification: { id: number };
}

// `@capacitor/network` — connectivity status + change events. Async, whereas ConnectivityBackend's
// getStatus is a synchronous snapshot; the adapter prefetches the status and subscribes to
// networkStatusChange to keep a local mirror current, filling the caller's `out` from it.
export interface CapacitorNetworkPlugin {
  addListener(
    eventName: 'networkStatusChange',
    listener: (status: Readonly<CapacitorConnectionStatus>) => void,
  ): Promise<CapacitorPluginListenerHandle>;
  getStatus(): Promise<CapacitorConnectionStatus>;
}

// `connectionType` is Capacitor's enum ('wifi' | 'cellular' | 'none' | 'unknown').
export interface CapacitorConnectionStatus {
  connected: boolean;
  connectionType: string;
}

// `@capacitor/share` — the native share sheet. `share` is async; the sync ShareBackend availability
// probes (isAvailable/canShare) read a boolean prefetched from `canShare` at construction. `files` are
// platform file URIs.
export interface CapacitorSharePlugin {
  canShare(): Promise<CapacitorShareCanResult>;
  share(options: Readonly<CapacitorShareOptions>): Promise<CapacitorShareResult>;
}

export interface CapacitorShareOptions {
  dialogTitle?: string;
  files?: string[];
  text?: string;
  title?: string;
  url?: string;
}

export interface CapacitorShareCanResult {
  value: boolean;
}

export interface CapacitorShareResult {
  activityType?: string;
}

// `@capacitor/status-bar` — the mobile status bar. Setters are async fire-and-forget; the sync
// StatusBarBackend.getInfo reads a value prefetched at construction. `style` is Capacitor's enum
// ('Dark' | 'Light' | 'Default'); `color` is a `#RRGGBB` hex string.
export interface CapacitorStatusBarPlugin {
  getInfo(): Promise<CapacitorStatusBarInfoResult>;
  hide(): Promise<void>;
  setBackgroundColor(options: Readonly<{ color: string }>): Promise<void>;
  setOverlaysWebView(options: Readonly<{ overlay: boolean }>): Promise<void>;
  setStyle(options: Readonly<{ style: string }>): Promise<void>;
  show(): Promise<void>;
}

export interface CapacitorStatusBarInfoResult {
  color?: string;
  overlays?: boolean;
  style: string;
  visible: boolean;
}
