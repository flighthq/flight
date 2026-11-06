import type { HostWindowCapabilities } from '@flighthq/app/contract';
import type { HostClipboardCapabilities } from '@flighthq/clipboard/contract';
import type { TauriMenuCapabilities } from '@flighthq/menu/contract';
import type { HostPlatformCapabilities } from '@flighthq/platform/contract';
import type { HostShellCapabilities } from '@flighthq/shell/contract';
import type { HostShortcutCapabilities } from '@flighthq/shortcut/contract';
import type { DesktopOsProfile } from '@flighthq/tray/contract';

import type { Host, HostDialogCapabilities } from './Host.ts';
import type { TauriNotificationCapabilities } from './Notification.ts';
import type { TauriAppCapabilities } from './TauriAppCapabilities.ts';
import type { TauriTrayCapabilitiesFor } from './TauriTrayCapabilitiesFor.ts';

export type TauriHost<Profile extends DesktopOsProfile> = Host & {
  readonly app: TauriAppCapabilities;
  readonly clipboard: Required<Pick<HostClipboardCapabilities, 'text'>>;
  readonly dialog: Required<Pick<HostDialogCapabilities, 'directoryOpen' | 'fileOpen' | 'fileSave' | 'message'>>;
  readonly menu: TauriMenuCapabilities;
  readonly notification: TauriNotificationCapabilities;
  readonly platform: Required<Pick<HostPlatformCapabilities, 'info'>>;
  readonly shell: Required<Pick<HostShellCapabilities, 'external' | 'pathOpen' | 'pathReveal'>>;
  readonly shortcut: Required<Pick<HostShortcutCapabilities, 'query' | 'trigger'>>;
  readonly tray: TauriTrayCapabilitiesFor<Profile>;
  // Tauri covers these window capability slots. It omits hierarchy and progress (no setParent or
  // taskbar-progress call) and, as electron does, the subscribe pair inside geometry, lifecycle and
  // visibility — its window events are wired straight to the window's own signals.
  readonly window: Required<
    Pick<
      HostWindowCapabilities,
      | 'appearance'
      | 'attach'
      | 'attention'
      | 'contentProtection'
      | 'focus'
      | 'fullscreen'
      | 'geometry'
      | 'lifecycle'
      | 'shadow'
      | 'shell'
      | 'sizeConstraints'
      | 'state'
      | 'visibility'
      | 'zOrder'
    >
  >;
};
