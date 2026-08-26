import * as fs from 'node:fs';
import { join } from 'node:path';

import { getAppName, getAppVersion } from '@flighthq/app/contract';
import { closeWindow, createApplicationWindow, openWindow } from '@flighthq/application/contract';
import { getElectronBrowserWindow, registerElectronBackends } from '@flighthq/host-electron';
import { getScreens } from '@flighthq/screen/contract';
import type { ElectronApi } from '@flighthq/types/contract';
import electron from 'electron';

import { captureHostProbeBackends, diffHostProbeBackends } from '#host-probe/capabilityBackends';
import type { HostProbeInstallResult, HostProbeResult } from '#host-probe/contract';

const { app, BrowserWindow, ipcMain } = electron;
let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let installResult: HostProbeInstallResult | null = null;

function createProbeWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 760,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl === undefined) {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { host: 'electron' } });
  } else {
    void mainWindow.loadURL(`${devUrl}?host=electron`);
  }
}

function installElectronProbe(): HostProbeInstallResult {
  const before = captureHostProbeBackends();
  const api: ElectronApi = {
    ...electron,
    fs,
    // Electron's NativeImage parameter is nominally richer than Flight's dependency-free handle.
    Tray: electron.Tray as ElectronApi['Tray'],
  };
  registerElectronBackends(api, { storageFileName: 'flight-host-probe-storage.json' });
  const changedCapabilities = diffHostProbeBackends(before, captureHostProbeBackends());
  const results: HostProbeResult[] = [];

  const appName = getAppName();
  const appVersion = getAppVersion();
  results.push({
    detail: appName.length > 0 ? `${appName} ${appVersion}`.trim() : 'Electron app identity is empty',
    id: 'runtime.app-identity',
    kind: 'runtime',
    status: appName.length > 0 ? 'pass' : 'fail',
  });

  const screens: ReturnType<typeof getScreens> = [];
  getScreens(screens);
  results.push({
    detail: `${screens.length} Electron screen(s)`,
    id: 'runtime.screen',
    kind: 'runtime',
    status: screens.length > 0 ? 'pass' : 'fail',
  });

  const probeWindow = createApplicationWindow();
  const opened = openWindow(probeWindow, { height: 120, title: 'Flight Host Probe Child', visible: false, width: 160 });
  const browserWindow = getElectronBrowserWindow(probeWindow);
  results.push({
    detail:
      opened && browserWindow !== null
        ? `BrowserWindow ${browserWindow.id} created through Flight`
        : 'Flight window did not bind a BrowserWindow',
    id: 'runtime.window',
    kind: 'runtime',
    status: opened && browserWindow !== null ? 'pass' : 'fail',
  });
  closeWindow(probeWindow);

  return { changedCapabilities, results };
}

void app.whenReady().then(() => {
  installResult = installElectronProbe();
  ipcMain.handle('flight:host-probe', () => installResult);
  createProbeWindow();
});

app.on('window-all-closed', () => app.quit());
