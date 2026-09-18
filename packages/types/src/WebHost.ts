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
  HostFontCapabilities,
  HostFullscreenCapabilities,
  HostGeolocationCapabilities,
  HostGlCapabilities,
  HostGlyphCapabilities,
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
  HostSocketCapabilities,
  HostSoftKeyboardCapabilities,
  HostStatusBarCapabilities,
  HostCanvasCapabilities,
  HostTargetCapabilities,
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
  | 'canvas'
  | 'connectivity'
  | 'device'
  | 'dialog'
  | 'fileSystem'
  | 'font'
  | 'fullscreen'
  | 'geolocation'
  | 'gl'
  | 'glyph'
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
  | 'socket'
  | 'softKeyboard'
  | 'statusBar'
  | 'target'
  | 'video'
  | 'window'
> & {
  readonly accessibility: Required<Pick<HostAccessibilityCapabilities, 'tree'>>;
  readonly app: Required<
    Pick<HostAppCapabilities, 'badge' | 'exit' | 'focus' | 'locale' | 'loop' | 'name' | 'quit' | 'ready' | 'relaunch'>
  >;
  readonly audio: Required<Pick<HostAudioCapabilities, 'codec' | 'device' | 'mixer'>>;
  readonly bitmap: Required<Pick<HostBitmapCapabilities, 'encode' | 'readback'>>;
  readonly canvas: Required<Pick<HostCanvasCapabilities, 'context'>>;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'change' | 'formats' | 'image' | 'text'>>;
  readonly connectivity: Required<Pick<HostConnectivityCapabilities, 'change' | 'reachability' | 'status'>>;
  readonly device: Required<Pick<HostDeviceCapabilities, 'info'>>;
  readonly dialog: Required<
    Pick<
      HostDialogCapabilities,
      'directoryOpen' | 'fileOpen' | 'fileSave' | 'imageOpen' | 'message' | 'photoCapture' | 'prompt' | 'videoCapture'
    >
  >;
  readonly fileSystem: Required<Pick<HostFileSystemCapabilities, 'access'>>;
  readonly font: Required<Pick<HostFontCapabilities, 'loader'>>;
  readonly fullscreen: Required<Pick<HostFullscreenCapabilities, 'element'>>;
  readonly geolocation: Required<Pick<HostGeolocationCapabilities, 'position'>>;
  readonly gl: Required<Pick<HostGlCapabilities, 'context'>>;
  readonly glyph: Required<Pick<HostGlyphCapabilities, 'rasterizer'>>;
  readonly haptics: Required<Pick<HostHapticsCapabilities, 'engine'>>;
  readonly image: Required<Pick<HostImageCapabilities, 'loader'>>;
  readonly input: Required<Pick<HostInputCapabilities, 'dropFile' | 'focus' | 'ingress' | 'pointerLock'>>;
  readonly lifecycle: Required<Pick<HostLifecycleCapabilities, 'state'>>;
  readonly mediaSession: Required<Pick<HostMediaSessionCapabilities, 'action' | 'control'>>;
  readonly menu: Required<Pick<HostMenuCapabilities, 'highlight' | 'popup'>>;
  readonly net: Required<Pick<HostNetCapabilities, 'http'>>;
  readonly notification: Required<Pick<HostNotificationCapabilities, 'permission'>>;
  readonly permissions: Required<Pick<HostPermissionsCapabilities, 'query'>>;
  readonly platform: Required<Pick<HostPlatformCapabilities, 'info'>>;
  readonly power: Required<Pick<HostPowerCapabilities, 'change' | 'keepAwake' | 'status' | 'suspension'>>;
  readonly preferences: Required<
    Pick<HostPreferencesCapabilities, 'change' | 'local' | 'persistenceQuery' | 'persistenceRequest'>
  >;
  readonly protocol: Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;
  readonly screen: Required<Pick<HostScreenCapabilities, 'change' | 'details' | 'permissionChange' | 'query'>>;
  readonly sensors: Required<Pick<HostSensorsCapabilities, 'query'>>;
  readonly share: Required<Pick<HostShareCapabilities, 'content' | 'files'>>;
  readonly shell: Required<Pick<HostShellCapabilities, 'external'>>;
  readonly socket: Required<Pick<HostSocketCapabilities, 'connection'>>;
  readonly softKeyboard: Required<Pick<HostSoftKeyboardCapabilities, 'change' | 'info' | 'visibility'>>;
  readonly statusBar: Required<Pick<HostStatusBarCapabilities, 'color'>>;
  readonly target: Required<Pick<HostTargetCapabilities, 'prepare' | 'resize'>>;
  readonly video: Required<Pick<HostVideoCapabilities, 'playback'>>;
  readonly window: Required<
    Pick<HostWindowCapabilities, 'appearance' | 'attach' | 'focus' | 'fullscreen' | 'geometry' | 'lifecycle'>
  >;
};
