import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  android: { webContentsDebuggingEnabled: true },
  appId: 'dev.flighthq.hostprobe',
  appName: 'Flight Host Probe',
  ios: { webContentsDebuggingEnabled: true },
  webDir: 'dist/capacitor',
};

export default config;
