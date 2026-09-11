import { createHost } from '@flighthq/entity/contract';
import type { DesktopOsProfile, TauriApi, TauriHost } from '@flighthq/types/contract';

import { tauriHostApp } from './tauriApp';
import { tauriHostClipboard } from './tauriClipboard';
import { tauriHostDialog } from './tauriDialog';
import { tauriHostMenu } from './tauriMenu';
import { tauriHostNotification } from './tauriNotification';
import { tauriHostSystem } from './tauriPlatform';
import { tauriHostShell } from './tauriShell';
import { tauriHostShortcut } from './tauriShortcut';
import { tauriHostTray } from './tauriTray';
import {
  tauriHostAccessibility,
  tauriHostConnectivity,
  tauriHostGraphics,
  tauriHostInput,
  tauriHostIpc,
  tauriHostMedia,
  tauriHostMidi,
  tauriHostNet,
  tauriHostPower,
  tauriHostProtocol,
  tauriHostScreen,
  tauriHostShare,
  tauriHostStorage,
  tauriHostText,
  tauriHostUi,
  tauriHostUpdater,
} from './tauriUnsupportedHostGroups';
import { tauriHostWindow } from './tauriWindow';

// Builds the explicit Tauri host from an injected aggregate of the Tauri v2 JS API modules and
// plugins. Unsupported groups are constructed explicitly so capability absence remains honest.
export function tauriHost<Profile extends DesktopOsProfile>(tauri: TauriApi, profile: Profile): TauriHost<Profile> {
  return createHost({
    accessibility: tauriHostAccessibility(),
    app: tauriHostApp(tauri),
    clipboard: tauriHostClipboard(tauri),
    connectivity: tauriHostConnectivity(),
    dialog: tauriHostDialog(tauri),
    graphics: tauriHostGraphics(),
    input: tauriHostInput(),
    ipc: tauriHostIpc(),
    media: tauriHostMedia(),
    menu: tauriHostMenu(tauri),
    midi: tauriHostMidi(),
    net: tauriHostNet(),
    notification: tauriHostNotification(tauri),
    power: tauriHostPower(),
    protocol: tauriHostProtocol(),
    screen: tauriHostScreen(),
    share: tauriHostShare(),
    shell: tauriHostShell(tauri),
    shortcut: tauriHostShortcut(tauri),
    storage: tauriHostStorage(),
    system: tauriHostSystem(tauri),
    text: tauriHostText(),
    tray: tauriHostTray(tauri, profile),
    ui: tauriHostUi(),
    updater: tauriHostUpdater(),
    window: tauriHostWindow(tauri),
  });
}
