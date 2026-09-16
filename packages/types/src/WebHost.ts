import type {
  Host,
  HostAccessibilityCapabilities,
  HostAppCapabilities,
  HostAudioCapabilities,
  HostBitmapCapabilities,
  HostClipboardCapabilities,
  HostConnectivityCapabilities,
  HostDeviceCapabilities,
  HostDialogCapabilities,
  HostFileSystemCapabilities,
  HostFullscreenCapabilities,
  HostGeolocationCapabilities,
  HostGlCapabilities,
  HostHapticsCapabilities,
  HostImageCapabilities,
  HostInputCapabilities,
  HostLifecycleCapabilities,
  HostMediaSessionCapabilities,
  HostMenuCapabilities,
  HostNetCapabilities,
  HostNotificationCapabilities,
  HostPermissionsCapabilities,
  HostPlatformCapabilities,
  HostPowerCapabilities,
  HostPreferencesCapabilities,
  HostProtocolCapabilities,
  HostScreenCapabilities,
  HostSensorsCapabilities,
  HostShareCapabilities,
  HostShellCapabilities,
  HostSoftKeyboardCapabilities,
  HostStatusBarCapabilities,
  HostStoragePersistenceCapabilities,
  HostSurfaceCapabilities,
  HostTextCapabilities,
  HostVideoCapabilities,
  HostWindowCapabilities,
} from './Host';

export type WebHost = Omit<
  Host,
  | 'accessibility'
  | 'app'
  | 'audio'
  | 'bitmap'
  | 'clipboard'
  | 'connectivity'
  | 'device'
  | 'dialog'
  | 'fileSystem'
  | 'fullscreen'
  | 'geolocation'
  | 'gl'
  | 'haptics'
  | 'image'
  | 'input'
  | 'lifecycle'
  | 'mediaSession'
  | 'menu'
  | 'net'
  | 'notification'
  | 'permissions'
  | 'platform'
  | 'power'
  | 'preferences'
  | 'protocol'
  | 'screen'
  | 'sensors'
  | 'share'
  | 'shell'
  | 'softKeyboard'
  | 'statusBar'
  | 'storagePersistence'
  | 'surface'
  | 'text'
  | 'video'
  | 'window'
> & {
  readonly accessibility: Required<Pick<HostAccessibilityCapabilities, 'provider'>>;
  readonly app: Required<
    Pick<
      HostAppCapabilities,
      'badge' | 'exit' | 'focus' | 'locale' | 'loop' | 'name' | 'quit' | 'ready' | 'relaunch' | 'visibility'
    >
  >;
  readonly audio: Required<Pick<HostAudioCapabilities, 'codec' | 'device' | 'mixer'>>;
  readonly bitmap: Required<Pick<HostBitmapCapabilities, 'encode' | 'readback'>>;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'change' | 'formats' | 'image' | 'text'>>;
  readonly connectivity: Required<Pick<HostConnectivityCapabilities, 'change' | 'reachability' | 'status'>>;
  readonly device: Required<Pick<HostDeviceCapabilities, 'info'>>;
  readonly dialog: Required<
    Pick<
      HostDialogCapabilities,
      'directoryOpen' | 'fileOpen' | 'fileSave' | 'imageOpen' | 'message' | 'photoCapture' | 'prompt' | 'videoCapture'
    >
  >;
  readonly fileSystem: Required<Pick<HostFileSystemCapabilities, 'provider'>>;
  readonly fullscreen: Required<Pick<HostFullscreenCapabilities, 'provider'>>;
  readonly geolocation: Required<Pick<HostGeolocationCapabilities, 'provider'>>;
  readonly gl: Required<Pick<HostGlCapabilities, 'context'>>;
  readonly haptics: Required<Pick<HostHapticsCapabilities, 'provider'>>;
  readonly image: Required<Pick<HostImageCapabilities, 'decode'>>;
  readonly input: Required<Pick<HostInputCapabilities, 'dropFile' | 'focus' | 'ingress' | 'pointerLock' | 'target'>>;
  readonly lifecycle: Required<Pick<HostLifecycleCapabilities, 'provider'>>;
  readonly mediaSession: Required<Pick<HostMediaSessionCapabilities, 'action' | 'session'>>;
  readonly menu: Required<Pick<HostMenuCapabilities, 'highlight' | 'popup'>>;
  readonly net: Required<Pick<HostNetCapabilities, 'http' | 'socket'>>;
  readonly notification: Required<Pick<HostNotificationCapabilities, 'permission'>>;
  readonly permissions: Required<Pick<HostPermissionsCapabilities, 'provider'>>;
  readonly platform: Required<Pick<HostPlatformCapabilities, 'info'>>;
  readonly power: Required<Pick<HostPowerCapabilities, 'change' | 'keepAwake' | 'status' | 'suspension'>>;
  readonly preferences: Required<Pick<HostPreferencesCapabilities, 'change' | 'local'>>;
  readonly protocol: Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;
  readonly screen: Required<Pick<HostScreenCapabilities, 'change' | 'details' | 'permissionChange' | 'query'>>;
  readonly sensors: Required<Pick<HostSensorsCapabilities, 'provider'>>;
  readonly share: Required<Pick<HostShareCapabilities, 'content' | 'files'>>;
  readonly shell: Required<Pick<HostShellCapabilities, 'external'>>;
  readonly softKeyboard: Required<Pick<HostSoftKeyboardCapabilities, 'change' | 'info' | 'visibility'>>;
  readonly statusBar: Required<Pick<HostStatusBarCapabilities, 'color'>>;
  readonly storagePersistence: Required<Pick<HostStoragePersistenceCapabilities, 'query' | 'request'>>;
  readonly surface: Required<Pick<HostSurfaceCapabilities, 'resize'>>;
  readonly text: Required<Pick<HostTextCapabilities, 'fontLoading' | 'glyphRasterizer'>>;
  readonly video: Required<Pick<HostVideoCapabilities, 'provider'>>;
  readonly window: Required<HostWindowCapabilities>;
};
