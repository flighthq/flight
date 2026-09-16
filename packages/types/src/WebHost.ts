import type { HostWindowProvider } from './ApplicationWindow';
import type {
  Host,
  HostAccessibilityCapabilities,
  HostAppCapabilities,
  HostClipboardCapabilities,
  HostConnectivityCapabilities,
  HostDialogCapabilities,
  HostGraphicsCapabilities,
  HostInputCapabilities,
  HostMediaCapabilities,
  HostMenuCapabilities,
  HostNetCapabilities,
  HostNotificationCapabilities,
  HostPowerCapabilities,
  HostProtocolCapabilities,
  HostScreenCapabilities,
  HostShareCapabilities,
  HostShellCapabilities,
  HostStorageCapabilities,
  HostSystemCapabilities,
  HostTextCapabilities,
  HostUiCapabilities,
} from './Host';

// The Web host, stating the slots the browser backends actually fill. Web is not uniform like Electron
// is per-OS: what the `webHost*` group consts supply is the shape of the browser platform, so naming it
// here is what lets a caller — and the C++ emitter — see a named host type rather than an anonymous
// structural row, and lets the compiler answer "what does this host have?" instead of "possibly
// undefined". Slots web does NOT fill are dropped rather than left optional: absence IS the signal
// (see the Host group contracts — omission is capability absence, never a stub answering false).
//
// Groups web creates but fills no slot of (ipc, midi, shortcut, tray, updater) keep the Host group's
// all-optional type, because "present and empty" and "absent" are the same fact to a consumer.
//
// Kept honest both ways by `webHost`'s `satisfies` in @flighthq/host-web: a slot listed here that no
// group fills fails to typecheck, and so does a filled slot missing here. Add a web capability by
// editing the group const and this type together.
export type WebHost = Omit<
  Host,
  | 'accessibility'
  | 'app'
  | 'clipboard'
  | 'connectivity'
  | 'dialog'
  | 'graphics'
  | 'input'
  | 'media'
  | 'menu'
  | 'net'
  | 'notification'
  | 'power'
  | 'protocol'
  | 'screen'
  | 'share'
  | 'shell'
  | 'storage'
  | 'system'
  | 'text'
  | 'ui'
  | 'window'
> & {
  readonly accessibility: Required<Pick<HostAccessibilityCapabilities, 'provider'>>;
  readonly app: Required<
    Pick<
      HostAppCapabilities,
      'badge' | 'exit' | 'focus' | 'locale' | 'loop' | 'name' | 'quit' | 'ready' | 'relaunch' | 'visibility'
    >
  >;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'change' | 'formats' | 'image' | 'text'>>;
  readonly connectivity: Required<Pick<HostConnectivityCapabilities, 'change' | 'reachability' | 'status'>>;
  readonly dialog: Required<
    Pick<
      HostDialogCapabilities,
      'directoryOpen' | 'fileOpen' | 'fileSave' | 'imageOpen' | 'message' | 'photoCapture' | 'prompt' | 'videoCapture'
    >
  >;
  readonly graphics: Required<
    Pick<HostGraphicsCapabilities, 'bitmapEncode' | 'bitmapReadback' | 'image' | 'renderContext' | 'renderSurface'>
  >;
  readonly input: Required<
    Pick<
      HostInputCapabilities,
      | 'dropFile'
      | 'focus'
      | 'haptics'
      | 'ingress'
      | 'pointerLock'
      | 'softKeyboardChange'
      | 'softKeyboardInfo'
      | 'softKeyboardVisibility'
      | 'target'
    >
  >;
  readonly media: Required<
    Pick<HostMediaCapabilities, 'audioCodec' | 'audioDevice' | 'audioMixer' | 'session' | 'sessionAction' | 'video'>
  >;
  readonly menu: Required<Pick<HostMenuCapabilities, 'highlight' | 'popup'>>;
  readonly net: Required<Pick<HostNetCapabilities, 'http' | 'socket'>>;
  readonly notification: Required<Pick<HostNotificationCapabilities, 'permission'>>;
  readonly power: Required<Pick<HostPowerCapabilities, 'change' | 'keepAwake' | 'status' | 'suspension'>>;
  readonly protocol: Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;
  readonly screen: Required<Pick<HostScreenCapabilities, 'change' | 'details' | 'permissionChange' | 'query'>>;
  readonly share: Required<Pick<HostShareCapabilities, 'content' | 'files'>>;
  readonly shell: Required<Pick<HostShellCapabilities, 'external'>>;
  readonly storage: Required<
    Pick<HostStorageCapabilities, 'change' | 'fileSystem' | 'local' | 'persistenceQuery' | 'persistenceRequest'>
  >;
  readonly system: Required<
    Pick<HostSystemCapabilities, 'device' | 'geolocation' | 'lifecycle' | 'permissions' | 'platform' | 'sensors'>
  >;
  readonly text: Required<Pick<HostTextCapabilities, 'fontLoading' | 'glyphRasterizer'>>;
  readonly ui: Required<Pick<HostUiCapabilities, 'fullscreen' | 'statusBarColor'>>;
  // A provider at group position, so the intersection keeps the members web leaves optional.
  readonly window: HostWindowProvider &
    Required<
      Pick<
        HostWindowProvider,
        | 'attach'
        | 'center'
        | 'close'
        | 'flashWindowFrame'
        | 'focus'
        | 'getBounds'
        | 'hide'
        | 'maximize'
        | 'minimize'
        | 'open'
        | 'requestAttention'
        | 'restore'
        | 'setAlwaysOnTop'
        | 'setContentProtection'
        | 'setFullscreen'
        | 'setHasShadow'
        | 'setIcon'
        | 'setMenuBarVisible'
        | 'setMinimumSize'
        | 'setMaximumSize'
        | 'setOpacity'
        | 'setParent'
        | 'setPosition'
        | 'setProgress'
        | 'setResizable'
        | 'setSize'
        | 'setSkipTaskbar'
        | 'setTitle'
        | 'show'
        | 'subscribeClose'
        | 'subscribeMove'
        | 'subscribeOrientation'
        | 'subscribeResize'
        | 'subscribeVisibility'
      >
    >;
};
