import type { DesktopOsProfile } from './Tray';

export interface ElectronHostOptions {
  // Injected by the Electron entry point. Host construction uses this fact to preserve exact
  // platform-specific capability coverage without consulting process.platform.
  readonly platform: DesktopOsProfile;
  readonly storageFileName?: string;
  readonly updaterFeedUrl?: string;
}
