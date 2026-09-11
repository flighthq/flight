import { createHost } from '@flighthq/entity/contract';
import type { CapacitorApi, CapacitorHost, MobileOsProfile } from '@flighthq/types/contract';

import { capacitorHostApp } from './capacitorApp';
import { capacitorHostClipboard } from './capacitorClipboard';
import { capacitorHostConnectivity } from './capacitorConnectivity';
import {
  capacitorHostAccessibility,
  capacitorHostGraphics,
  capacitorHostIpc,
  capacitorHostMedia,
  capacitorHostMenu,
  capacitorHostMidi,
  capacitorHostNet,
  capacitorHostPower,
  capacitorHostScreen,
  capacitorHostShell,
  capacitorHostShortcut,
  capacitorHostText,
  capacitorHostTray,
  capacitorHostUpdater,
  capacitorHostWindow,
} from './capacitorDefaultHostGroups';
import { capacitorHostDialog } from './capacitorDialog';
import { capacitorHostInput } from './capacitorInputHost';
import { capacitorHostNotification } from './capacitorNotification';
import { capacitorHostProtocol } from './capacitorProtocol';
import { capacitorHostShare } from './capacitorShare';
import { capacitorHostUi } from './capacitorStatusBar';
import { capacitorHostStorage } from './capacitorStorageHost';
import { capacitorHostSystem } from './capacitorSystemHost';

// The explicit Capacitor host. Every populated slot below is backed by a real plugin operation; empty
// groups make unsupported or not-yet-migrated coverage explicit.
export function capacitorHost<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorHost<Profile> {
  return createHost({
    accessibility: capacitorHostAccessibility(),
    app: capacitorHostApp(capacitor, profile),
    clipboard: capacitorHostClipboard(capacitor),
    connectivity: capacitorHostConnectivity(capacitor),
    dialog: capacitorHostDialog(capacitor),
    graphics: capacitorHostGraphics(),
    input: capacitorHostInput(capacitor),
    ipc: capacitorHostIpc(),
    media: capacitorHostMedia(),
    menu: capacitorHostMenu(),
    midi: capacitorHostMidi(),
    net: capacitorHostNet(),
    notification: capacitorHostNotification(capacitor),
    power: capacitorHostPower(),
    protocol: capacitorHostProtocol(capacitor),
    screen: capacitorHostScreen(),
    share: capacitorHostShare(capacitor),
    shell: capacitorHostShell(),
    shortcut: capacitorHostShortcut(),
    storage: capacitorHostStorage(capacitor),
    system: capacitorHostSystem(capacitor),
    text: capacitorHostText(),
    tray: capacitorHostTray(),
    ui: capacitorHostUi(capacitor),
    updater: capacitorHostUpdater(),
    window: capacitorHostWindow(),
  });
}
