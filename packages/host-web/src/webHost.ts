import { createHost } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

import { webHostAccessibilityGroup } from './webAccessibilityHost';
import { webHostApp } from './webAppHost';
import { webHostClipboard } from './webClipboardHost';
import { webHostConnectivity } from './webConnectivityHost';
import {
  webHostIpc,
  webHostMidi,
  webHostNotification,
  webHostShortcut,
  webHostTray,
  webHostUpdater,
} from './webDefaultHostGroups';
import { webHostDialog } from './webDialogHost';
import { webHostGraphics } from './webGraphicsHost';
import { webHostNetGroup } from './webHostNet';
import { webHostInput } from './webInputHost';
import { webHostMedia } from './webMediaHost';
import { webHostMenu } from './webMenuHost';
import { webHostPower } from './webPower';
import { webHostProtocol } from './webProtocolHost';
import { webHostScreen } from './webScreen';
import { webHostShare } from './webShareHost';
import { webHostShell } from './webShellHost';
import { webHostStorageGroup } from './webStorageHost';
import { webHostSystem } from './webSystemHost';
import { webHostText } from './webTextHost';
import { webHostUi } from './webUiHost';
import { webHostWindow } from './webWindow';

export const webHost = createHost({
  accessibility: webHostAccessibilityGroup,
  app: webHostApp,
  clipboard: webHostClipboard,
  connectivity: webHostConnectivity,
  dialog: webHostDialog,
  graphics: webHostGraphics,
  input: webHostInput,
  ipc: webHostIpc,
  media: webHostMedia,
  menu: webHostMenu,
  midi: webHostMidi,
  net: webHostNetGroup,
  notification: webHostNotification,
  power: webHostPower,
  protocol: webHostProtocol,
  screen: webHostScreen,
  share: webHostShare,
  shell: webHostShell,
  shortcut: webHostShortcut,
  storage: webHostStorageGroup,
  system: webHostSystem,
  text: webHostText,
  tray: webHostTray,
  ui: webHostUi,
  updater: webHostUpdater,
  window: webHostWindow,
} as const satisfies Omit<Host, typeof EntityRuntimeKey>);
