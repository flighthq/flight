import { join } from 'node:path';

import electron from 'electron';

import {
  createApplicationWindow,
  createMenuItemTemplate,
  createTrayIcon,
  getScreens,
  getAppLocale,
  getAppName,
  getAppVersion,
  onMenuSelect,
  onTrayEvent,
  openWindow,
  readClipboardText,
  registerGlobalShortcut,
  setApplicationMenu,
  setAppBadgeCount,
  setTrayIconTooltip,
  showNotification,
  showOpenFileDialog,
  writeClipboardText,
} from '@flighthq/sdk';
import type { ApplicationWindow, MenuItemTemplate, ScreenInfo } from '@flighthq/sdk';
import { getElectronBrowserWindow, registerElectronBackends } from '@flighthq/host-electron';
import type { ElectronApi } from '@flighthq/host-electron';

const { app, ipcMain } = electron;

// The single Flight window this harness drives. Created via Flight's window backend (which constructs
// the real BrowserWindow under the hood); we reach the BrowserWindow back out with
// getElectronBrowserWindow only to load page content — everything else goes through the Flight API.
let mainWindow: ApplicationWindow | null = null;

function loadRenderer(win: ApplicationWindow): void {
  const bw = getElectronBrowserWindow(win);
  if (bw === null) {
    console.error('[harness] no BrowserWindow for the Flight window');
    return;
  }
  const devURL = process.env['ELECTRON_RENDERER_URL'];
  if (devURL !== undefined) {
    void bw.loadURL(devURL);
  } else {
    void bw.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Renderer → main bridge: capability calls that must run in the main process. The renderer invokes
// these over IPC (see preload); each handler is a plain Flight capability call that, thanks to
// registerElectronBackends, is now serviced by Electron.
function installIpcBridge(): void {
  ipcMain.handle('flight:openFileDialog', () => showOpenFileDialog({ title: 'Pick a file' }));
  ipcMain.handle('flight:readClipboard', () => readClipboardText());
  ipcMain.handle('flight:writeClipboard', (_event: unknown, text: unknown) => writeClipboardText(String(text)));
  ipcMain.handle('flight:notify', (_event: unknown, body: unknown) =>
    showNotification({ title: 'Flight Harness', body: String(body) }),
  );
}

// One-shot demonstration of the OS-integration seams, logged to the terminal so a run visibly proves
// the Electron backends are wired.
function runOsIntegrationDemo(): void {
  console.log('[harness] app:', getAppName(), getAppVersion(), getAppLocale());

  const screens: ScreenInfo[] = [];
  getScreens(screens);
  console.log('[harness] screens:', screens.length);

  setAppBadgeCount(3);

  const menu: readonly MenuItemTemplate[] = [
    createMenuItemTemplate({
      label: 'Flight',
      submenu: [
        createMenuItemTemplate({ id: 'about', label: 'About Flight Harness' }),
        createMenuItemTemplate({ type: 'separator' }),
        createMenuItemTemplate({ id: 'quit', role: 'quit', label: 'Quit' }),
      ],
    }),
  ];
  setApplicationMenu(menu);
  onMenuSelect((id) => console.log('[harness] menu select:', id));

  registerGlobalShortcut('CommandOrControl+Shift+F', () => console.log('[harness] global shortcut fired'));

  void (async () => {
    await writeClipboardText('Hello from Flight via Electron');
    console.log('[harness] clipboard round-trip:', await readClipboardText());
  })();

  try {
    const tray = createTrayIcon({ tooltip: 'Flight Harness' });
    if (tray !== null) {
      setTrayIconTooltip(tray, 'Flight Harness (ready)');
      onTrayEvent((id, event) => console.log('[harness] tray event:', id, event));
    }
  } catch (error) {
    // Electron's Tray needs a valid icon image; without bundling one this can throw. Non-fatal here.
    console.warn('[harness] tray unavailable (needs an icon asset):', error);
  }
}

void app.whenReady().then(() => {
  // Swap the web defaults for Electron implementations across every seam. Pass the real electron
  // module; it satisfies ElectronApi structurally.
  registerElectronBackends(electron as unknown as ElectronApi);
  installIpcBridge();

  mainWindow = createApplicationWindow();
  openWindow(mainWindow, { title: 'Flight Electron Harness', width: 1024, height: 720 });
  loadRenderer(mainWindow);

  runOsIntegrationDemo();

  app.on('activate', () => {
    if (mainWindow !== null && getElectronBrowserWindow(mainWindow) === null) {
      openWindow(mainWindow, { title: 'Flight Electron Harness', width: 1024, height: 720 });
      loadRenderer(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
