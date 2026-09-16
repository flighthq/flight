import { createHost } from '@flighthq/host/contract';
import type { EntityRuntimeKey, WebHost } from '@flighthq/types/contract';

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

// `satisfies Omit<WebHost, …>` is what keeps WebHost honest in the direction that matters: a slot it
// claims that no group fills fails to typecheck here. The converse — a group gaining a slot WebHost does
// not list — is NOT caught at this site, because the group value is an identifier and `satisfies` only
// excess-checks a fresh object literal. That direction cannot mislead, though: WebHost would understate,
// and the first caller to reach for the new slot gets a type error naming the gap. The annotation on the
// const then publishes WebHost as the host's type — a named struct in C++ rather than an anonymous
// structural row, and for a caller a host whose filled slots are stated.
const groups = {
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
} as const satisfies Omit<WebHost, typeof EntityRuntimeKey>;

export const webHost: WebHost = createHost(groups);
