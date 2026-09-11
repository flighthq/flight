import { createHost } from '@flighthq/entity/contract';
import type {
  DesktopOsProfile,
  ElectronApi,
  ElectronHost,
  ElectronHostOptions,
  ElectronMacosHost,
  EntityRuntimeKey,
  Host,
} from '@flighthq/types/contract';

import { electronHostApp } from './electronApp';
import { electronHostClipboard } from './electronClipboard';
import {
  electronHostAccessibilityGroup,
  electronHostConnectivity,
  electronHostGraphics,
  electronHostInput,
  electronHostMedia,
  electronHostMidi,
  electronHostNetGroup,
  electronHostShare,
  electronHostText,
  electronHostUi,
} from './electronDefaultHostGroups';
import { electronHostDialog } from './electronDialog';
import { electronHostIpc } from './electronIpc';
import { electronHostMenu } from './electronMenu';
import { electronHostNotification } from './electronNotification';
import { electronHostSystem } from './electronPlatform';
import { electronHostPower } from './electronPower';
import { electronHostProtocol } from './electronProtocol';
import { electronHostScreen } from './electronScreen';
import { electronHostShell } from './electronShell';
import { electronHostShortcut } from './electronShortcut';
import { electronHostStorageGroup } from './electronStorage';
import { electronHostTray } from './electronTray';
import { electronHostUpdater } from './electronUpdater';
import { electronHostWindow } from './electronWindow';

// Constructs the explicit Electron host from an injected Electron API and platform profile. Every
// group is built through its separately exported constructor, including exact empty groups for
// unsupported coverage; no process-wide registration or ambient state is installed.
export function electronHost(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions> & { readonly platform: 'macos' },
): ElectronMacosHost;
export function electronHost<Profile extends 'linux' | 'windows'>(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions> & { readonly platform: Profile },
): ElectronHost<Profile>;
export function electronHost(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronHost<DesktopOsProfile> | ElectronMacosHost;
export function electronHost(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronHost<DesktopOsProfile> | ElectronMacosHost {
  const groups = {
    accessibility: electronHostAccessibilityGroup(electron),
    app: electronHostApp(electron, options.platform),
    clipboard: electronHostClipboard(electron),
    connectivity: electronHostConnectivity(electron),
    dialog: electronHostDialog(electron),
    graphics: electronHostGraphics(electron),
    input: electronHostInput(electron),
    ipc: electronHostIpc(electron),
    media: electronHostMedia(electron),
    menu: electronHostMenu(electron),
    midi: electronHostMidi(electron),
    net: electronHostNetGroup(electron),
    notification: electronHostNotification(electron, options),
    power: electronHostPower(electron),
    protocol: electronHostProtocol(electron),
    screen: electronHostScreen(electron),
    share: electronHostShare(electron),
    shell: electronHostShell(electron, options.platform),
    shortcut: electronHostShortcut(electron),
    storage: electronHostStorageGroup(electron, options.storageFileName),
    system: electronHostSystem(electron),
    text: electronHostText(electron),
    tray: electronHostTray(electron, options.platform),
    ui: electronHostUi(electron),
    updater: electronHostUpdater(electron, options.updaterFeedUrl),
    window: electronHostWindow(electron),
  } as const satisfies Omit<Host, typeof EntityRuntimeKey>;
  return createHost(groups) as ElectronHost<DesktopOsProfile> | ElectronMacosHost;
}
